import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Item } from '../types';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../constants/theme';

interface Props {
    visible: boolean;
    item: Item | null;
    onClose: () => void;
    onSave: (updatedItem: Item) => void;
}

export default function EditItemModal({ visible, item, onClose, onSave }: Props) {
    const [name, setName] = useState('');
    const [qty, setQty] = useState('');
    const [price, setPrice] = useState('');
    const [expiry, setExpiry] = useState('');

    useEffect(() => {
        if (item) {
            setName(item.name);
            setQty(item.quantity.toString());
            setPrice(item.purchasePrice.toString());
            setExpiry(new Date(item.expiryDate).toISOString().split('T')[0]);
        }
    }, [item]);

    const handleSave = () => {
        if (item) {
            onSave({
                ...item,
                name,
                quantity: parseFloat(qty) || item.quantity,
                purchasePrice: parseFloat(price) || item.purchasePrice,
                expiryDate: new Date(expiry).toISOString()
            });
            onClose();
        }
    };

    if (!item) return null;

    return (
        <Modal visible={visible} transparent animationType="slide">
            <View style={styles.center}>
                <View style={styles.card}>
                    <Text style={styles.title}>Edit Item</Text>

                    <Text style={Typography.label}>Name</Text>
                    <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor={Colors.light.textSecondary} />

                    <View style={styles.row}>
                        <View style={{ flex: 1, marginRight: Spacing.m }}>
                            <Text style={Typography.label}>Quantity ({item.unit})</Text>
                            <TextInput style={styles.input} value={qty} onChangeText={setQty} keyboardType="numeric" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={Typography.label}>Price ($)</Text>
                            <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="numeric" />
                        </View>
                    </View>

                    <Text style={Typography.label}>Expiry (YYYY-MM-DD)</Text>
                    <TextInput style={styles.input} value={expiry} onChangeText={setExpiry} />

                    <View style={styles.actions}>
                        <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
                            <Text style={styles.saveText}>Save Changes</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: Spacing.xl },
    card: { backgroundColor: Colors.light.card, padding: Spacing.xl, borderRadius: BorderRadius.l, ...Shadows.strong },
    title: { ...Typography.subHeader, marginBottom: Spacing.l },
    input: {
        borderWidth: 1,
        borderColor: Colors.light.border,
        borderRadius: BorderRadius.s,
        padding: Spacing.m,
        fontSize: 16,
        marginBottom: Spacing.m,
        backgroundColor: Colors.light.background,
        color: Colors.light.text
    },
    row: { flexDirection: 'row', marginBottom: Spacing.m },
    actions: { flexDirection: 'row', marginTop: Spacing.l, justifyContent: 'flex-end', gap: Spacing.m },

    cancelBtn: { paddingVertical: Spacing.m, paddingHorizontal: Spacing.l, borderRadius: BorderRadius.s, backgroundColor: Colors.light.secondary },
    cancelText: { color: Colors.light.text, fontWeight: '600' },

    saveBtn: { backgroundColor: Colors.light.primary, paddingVertical: Spacing.m, paddingHorizontal: Spacing.l, borderRadius: BorderRadius.s },
    saveText: { color: 'white', fontWeight: '600' }
});