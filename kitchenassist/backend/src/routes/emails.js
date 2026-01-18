const { google } = require('googleapis');
const express = require('express');
const router = express.Router();

router.get('/latest-bodies', async (req, res) => {
    try {
        const auth = req.app.locals.gmailAuth;
        const gmail = google.gmail({ version: 'v1', auth });

        // 1. Get the 2 most recent unread messages
        const listRes = await gmail.users.messages.list({
            userId: 'me',
            q: 'is:unread',
            maxResults: 2,
        });

        const messages = listRes.data.messages || [];

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
                    // Gmail API uses base64url encoding
                    bodyText = Buffer.from(part.body.data, 'base64').toString('utf-8');
                } else if (detail.data.payload.body.data) {
                    // Handle cases where there are no parts (simple emails)
                    bodyText = Buffer.from(detail.data.payload.body.data, 'base64').toString('utf-8');
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
        console.error('Error fetching email bodies:', error);
        res.status(500).json({ error: 'Failed to fetch email bodies' });
    }
});

module.exports = router;