import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, Button } from 'react-native';
import Slider from '@react-native-community/slider';
import { Item } from '../types';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../constants/theme';

interface Props {
    visible: boolean;
    item: Item | null;
    onClose: () => void;
    onConfirm: (id: string, percentWasted: number) => void;
}

export default function RemoveItemModal({ visible, item, onClose, onConfirm }: Props) {
    const [percent, setPercent] = useState(0);

    useEffect(() => {
        setPercent(0);
    }, [item, visible]);

    if (!item) return null;

    const moneyLost = (item.purchasePrice * (percent / 100)).toFixed(2);

    return (
        <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={onClose}>
            <View style={styles.centeredView}>
                <View style={styles.modalView}>
                    <Text style={styles.title}>Wasted {item.name}?</Text>
                    <Text style={Typography.caption}>Use the slider to estimate how much you threw away.</Text>

                    <Text style={styles.percentText}>{percent}%</Text>
                    <Text style={styles.moneyText}>(-${moneyLost})</Text>

                    <Slider
                        style={{ width: '100%', height: 40 }}
                        minimumValue={0}
                        maximumValue={100}
                        step={5}
                        value={percent}
                        onValueChange={setPercent}
                        minimumTrackTintColor={Colors.light.danger}
                        maximumTrackTintColor={Colors.light.textSecondary}
                        thumbTintColor={Colors.light.danger}
                    />

                    <View style={styles.labels}>
                        <Text style={styles.tinyLabel}>Empty</Text>
                        <Text style={styles.tinyLabel}>Full</Text>
                    </View>

                    <View style={styles.buttonRow}>
                        <View style={{ flex: 1, marginRight: 10 }}>
                            <Button title="Cancel" color={Colors.light.textSecondary} onPress={onClose} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Button title="Confirm Waste" color={Colors.light.danger} onPress={() => onConfirm(item.id, percent)} />
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    centeredView: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalView: { width: '85%', backgroundColor: Colors.light.card, borderRadius: BorderRadius.xl, padding: Spacing.xl, alignItems: 'center', ...Shadows.strong },
    title: { ...Typography.subHeader, textAlign: 'center' },
    percentText: { fontSize: 42, fontWeight: 'bold', color: Colors.light.text, marginTop: Spacing.l },
    moneyText: { fontSize: 18, color: Colors.light.danger, marginBottom: Spacing.l, fontWeight: '600' },
    labels: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: Spacing.l },
    tinyLabel: { ...Typography.caption, fontSize: 12 },
    buttonRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' }
});