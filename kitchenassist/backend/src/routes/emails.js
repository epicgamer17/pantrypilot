const { google } = require('googleapis');
const { ObjectId } = require('mongodb');
const express = require('express');
const router = express.Router();

let auth0MgmtToken = null;
let auth0MgmtTokenExpiry = 0;

const getAuth0Domain = () => {
    const raw = process.env.AUTH0_DOMAIN || '';
    return raw.startsWith('http') ? raw : `https://${raw}`;
};

const getAuth0MgmtToken = async () => {
    const domain = getAuth0Domain();
    const clientId = process.env.AUTH0_M2M_CLIENT_ID;
    const clientSecret = process.env.AUTH0_M2M_CLIENT_SECRET;
    if (!domain || !clientId || !clientSecret) return null;

    const now = Date.now();
    if (auth0MgmtToken && now < auth0MgmtTokenExpiry) return auth0MgmtToken;

    const response = await fetch(`${domain}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
            audience: `${domain}/api/v2/`,
        }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    auth0MgmtToken = data.access_token;
    auth0MgmtTokenExpiry = now + ((data.expires_in || 3600) - 60) * 1000;
    return auth0MgmtToken;
};

const getGoogleAccessTokenFromAuth0 = async (req) => {
    const db = req.app.locals.db;
    const userId = req.auth?.userId;
    if (!db || !userId) return null;

    const user = await db
        .collection('users')
        .findOne({ _id: new ObjectId(userId) });
    const auth0UserId = user?.auth0UserId;
    if (!auth0UserId) return null;

    const mgmtToken = await getAuth0MgmtToken();
    if (!mgmtToken) return null;

    const domain = getAuth0Domain();
    const response = await fetch(
        `${domain}/api/v2/users/${encodeURIComponent(auth0UserId)}?fields=identities&include_fields=true`,
        {
            headers: { Authorization: `Bearer ${mgmtToken}` },
        },
    );
    if (!response.ok) return null;
    const data = await response.json();
    const identities = Array.isArray(data.identities) ? data.identities : [];
    const googleIdentity = identities.find((identity) =>
        String(identity?.provider).includes('google'),
    );
    return googleIdentity?.access_token || null;
};

router.get('/latest-bodies', async (req, res) => {
    try {
        const authHeader = req.header('authorization') || '';
        let auth = req.app.locals.gmailAuth;
        let bearerToken = null;
        if (authHeader.toLowerCase().startsWith('bearer ')) {
            bearerToken = authHeader.slice(7).trim();
        }
        if (!auth) {
            const googleToken = await getGoogleAccessTokenFromAuth0(req);
            if (googleToken) {
                const oauth2Client = new google.auth.OAuth2();
                oauth2Client.setCredentials({ access_token: googleToken });
                auth = oauth2Client;
            }
        }
        if (!auth && bearerToken) {
            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: bearerToken });
            auth = oauth2Client;
        }
        if (!auth) {
            return res.status(401).json({ error: 'Missing Gmail auth token.' });
        }
        const gmail = google.gmail({ version: 'v1', auth });

        // 1. Get the 2 most recent unread messages
        const listRes = await gmail.users.messages.list({
            userId: 'me',
            q: 'is:unread',
            maxResults: 2,
        });

        const messages = listRes.data.messages || [];

        const decodeBody = (data) => {
            if (!data) return '';
            const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
            const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
            return Buffer.from(padded, 'base64').toString('utf-8');
        };

        const emailBodies = await Promise.all(
            messages.map(async (msg) => {
                const detail = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                });

                // 2. Extract the text body from the payload parts
                let bodyText = "";
                const part = detail.data.payload.parts?.find(p => p.mimeType === 'text/plain');

                if (part && part.body.data) {
                    bodyText = decodeBody(part.body.data);
                } else if (detail.data.payload.body.data) {
                    bodyText = decodeBody(detail.data.payload.body.data);
                }

                return {
                    id: detail.data.id,
                    subject: detail.data.payload?.headers?.find(h => h.name === 'Subject')?.value,
                    body: bodyText
                };
            })
        );

        res.json(emailBodies);
    } catch (error) {
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
            return res.status(401).json({ error: 'Invalid Gmail credentials.' });
        }
        console.error('Error fetching email bodies:', error);
        res.status(500).json({ error: 'Failed to fetch email bodies' });
    }
});

router.get('/diagnostics', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const userId = req.auth?.userId;
        if (!db || !userId) {
            return res.status(401).json({ error: 'Missing authenticated user.' });
        }

        const diagnostics = {
            auth0: {
                domainConfigured: Boolean(process.env.AUTH0_DOMAIN),
                m2mClientIdConfigured: Boolean(process.env.AUTH0_M2M_CLIENT_ID),
                m2mClientSecretConfigured: Boolean(process.env.AUTH0_M2M_CLIENT_SECRET),
                mgmtTokenFetched: false,
                auth0UserIdFound: false,
                googleIdentityFound: false,
                googleAccessTokenPresent: false,
            },
        };

        const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
        const auth0UserId = user?.auth0UserId;
        diagnostics.auth0.auth0UserIdFound = Boolean(auth0UserId);

        const mgmtToken = await getAuth0MgmtToken();
        diagnostics.auth0.mgmtTokenFetched = Boolean(mgmtToken);

        if (!auth0UserId || !mgmtToken) {
            return res.json(diagnostics);
        }

        const domain = getAuth0Domain();
        const response = await fetch(
            `${domain}/api/v2/users/${encodeURIComponent(auth0UserId)}?fields=identities&include_fields=true`,
            { headers: { Authorization: `Bearer ${mgmtToken}` } },
        );
        if (!response.ok) {
            diagnostics.auth0.managementApiStatus = response.status;
            return res.json(diagnostics);
        }

        const data = await response.json();
        const identities = Array.isArray(data.identities) ? data.identities : [];
        const googleIdentity = identities.find((identity) =>
            String(identity?.provider).includes('google'),
        );
        diagnostics.auth0.googleIdentityFound = Boolean(googleIdentity);
        diagnostics.auth0.googleAccessTokenPresent = Boolean(googleIdentity?.access_token);

        return res.json(diagnostics);
    } catch (error) {
        console.error('Email diagnostics failed:', error);
        return res.status(500).json({ error: 'Diagnostics failed.' });
    }
});

module.exports = router;
