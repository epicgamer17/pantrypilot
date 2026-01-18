import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions, TouchableOpacity } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/ui/Card'; // Import Card
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../../constants/theme';

export default function AnalyticsScreen() {
  const { purchaseHistory, calculateTotalWasteCost, recentlyDepletedItems } = useApp();
  const { width } = useWindowDimensions();

  const contentWidth = width > 840 ? 800 : width;
  const chartWidth = contentWidth - 40;

  const monthlySpending: { [key: string]: number } = {};
  purchaseHistory.forEach(item => {
    if (item.category === 'Total') {
      const date = new Date(item.date);
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short' });
      monthlySpending[monthLabel] = (monthlySpending[monthLabel] || 0) + item.price;
    }
  });

  const chartLabels = Object.keys(monthlySpending);
  const chartValues = Object.values(monthlySpending);

  let trendPercentage = 0;
  if (chartValues.length >= 2) {
    const first = chartValues[0];
    const last = chartValues[chartValues.length - 1];
    trendPercentage = ((last - first) / first) * 100;
  }

  const spendingData = {
    labels: chartLabels.length > 0 ? chartLabels : ["No Data"],
    datasets: [{
      data: chartValues.length > 0 ? chartValues : [0],
      color: (opacity = 1) => `rgba(51, 51, 51, ${opacity})`,
      strokeWidth: 3
    }]
  };

  const expensiveItems = purchaseHistory
    .filter(i => i.price > 20 && i.category !== 'Total')
    .sort((a, b) => b.price - a.price)
    .slice(0, 3);

  const itemCounts: { [key: string]: number } = {};
  const itemPrices: { [key: string]: number } = {};

  purchaseHistory.forEach(i => {
    if (i.category !== 'Total') {
      itemCounts[i.name] = (itemCounts[i.name] || 0) + 1;
      itemPrices[i.name] = i.price;
    }
  });

  const frequentItems = Object.keys(itemCounts)
    .filter(name => itemCounts[name] > 3)
    .map(name => ({ name, count: itemCounts[name], avgPrice: itemPrices[name] }));

  const milkHistory = purchaseHistory
    .filter(i => i.name === 'Milk')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const purchaseEntries = [...purchaseHistory]
    .filter((entry) => entry.name && entry.category !== 'Total')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const [purchasePage, setPurchasePage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(purchaseEntries.length / pageSize));
  const pagedPurchases = purchaseEntries.slice(0, purchasePage * pageSize);

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ alignItems: 'center' }}>
      <View style={[styles.container, { width: contentWidth }]}>
        <Text style={Typography.header}>Insights</Text>

        {/* --- SPENDING TRENDS --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Spending Trends 📈</Text>
          <Text style={Typography.caption}>Total monthly grocery spend</Text>

          <Card variant="elevated" style={styles.chartCardOverride}>
            {chartValues.length > 0 ? (
              <LineChart
                data={spendingData}
                width={chartWidth}
                height={240}
                yAxisLabel="$"
                yAxisInterval={1}
                chartConfig={{
                  backgroundColor: Colors.light.card,
                  backgroundGradientFrom: Colors.light.card,
                  backgroundGradientTo: Colors.light.card,
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(51, 51, 51, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(100, 100, 100, ${opacity})`,
                  style: { borderRadius: BorderRadius.l },
                  propsForDots: { r: "5", strokeWidth: "2", stroke: Colors.light.card },
                  propsForBackgroundLines: { strokeDasharray: "" }
                }}
                bezier
                style={{ marginVertical: 8, borderRadius: BorderRadius.l }}
                withHorizontalLabels={true}
                withVerticalLabels={true}
              />
            ) : (
              <Text style={{ textAlign: 'center', margin: 20, color: '#999' }}>Not enough data yet</Text>
            )}
          </Card>

          {chartValues.length >= 2 && (
            <Text style={styles.insightAlert}>
              💡 Spending is {trendPercentage > 0 ? 'up' : 'down'} <Text style={{ fontWeight: 'bold', color: trendPercentage > 0 ? Colors.light.danger : Colors.light.success }}>
                {Math.abs(trendPercentage).toFixed(1)}%
              </Text> since {chartLabels[0]}.
            </Text>
          )}
        </View>

        {/* --- BULK BUY OPPORTUNITIES --- */}
        {frequentItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bulk Buy Opportunities 📦</Text>
            <Text style={Typography.caption}>You buy these often. Size up to save.</Text>

            {frequentItems.map((item, index) => {
              const potentialSavings = (item.avgPrice * item.count) * 0.20;
              return (
                <Card key={index} variant="elevated" style={styles.opportunityCardOverride}>
                  <View>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <Text style={Typography.caption}>Bought {item.count} times recently</Text>
                  </View>
                  <View style={styles.savingsBadge}>
                    <Text style={styles.savingsText}>Save ~${potentialSavings.toFixed(2)}</Text>
                  </View>
                </Card>
              );
            })}
          </View>
        )}

        {/* --- SMART SWAPS --- */}
        {expensiveItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Smart Swaps 💸</Text>
            <Text style={Typography.caption}>High cost items found in history</Text>

            {expensiveItems.map((item) => (
              <Card key={item.id} variant="elevated" style={styles.swapCardOverride}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Text style={Typography.caption}>Paid ${item.price.toFixed(2)} at {item.store}</Text>
                </View>
                <View>
                  <Text style={styles.suggestionTitle}>Try Generic?</Text>
                  <Text style={styles.suggestionPrice}>Est. ${(item.price * 0.6).toFixed(2)}</Text>
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* --- PRICE WATCH TABLE --- */}
        {milkHistory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Price Watch: Milk 🥛</Text>
            <Text style={Typography.caption}>Tracking inflation at {milkHistory[0]?.store || 'Store'}</Text>

            <Card variant="elevated" style={styles.tableCardOverride}>
              <View style={[styles.tableRow, { borderBottomWidth: 2 }]}>
                <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>Date</Text>
                <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>Price</Text>
                <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>Trend</Text>
              </View>
              {milkHistory.map((h, i) => {
                const prevPrice = i > 0 ? milkHistory[i - 1].price : h.price;
                const isUp = h.price > prevPrice;
                const isSame = h.price === prevPrice;

                return (
                  <View key={h.id} style={styles.tableRow}>
                    <Text style={styles.tableCell}>{new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
                    <Text style={styles.tableCell}>${h.price.toFixed(2)}</Text>
                    <Text style={[styles.tableCell, { color: isUp ? Colors.light.danger : isSame ? Colors.light.textSecondary : Colors.light.success }]}>
                      {isUp ? '▲' : isSame ? '-' : '▼'}
                    </Text>
                  </View>
                );
              })}
            </Card>
          </View>
        )}

        {/* --- PURCHASE HISTORY --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Purchase History 🧾</Text>
          <Text style={Typography.caption}>Most recent items you've bought</Text>

          {pagedPurchases.length ? (
            <Card variant="elevated" style={styles.historyCardOverride}>
              <ScrollView style={styles.historyList}>
                {pagedPurchases.map((entry) => {
                  const total = (entry.price || 0) * (entry.quantity || 1);
                  const dateLabel = new Date(entry.date).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  });
                  return (
                    <View key={entry.id} style={styles.historyRow}>
                      <View style={styles.historyMeta}>
                        <Text style={styles.cardTitle}>{entry.name}</Text>
                        <Text style={Typography.caption}>
                          {dateLabel} · {entry.store || 'Store'} · {entry.quantity} {entry.unit}
                        </Text>
                      </View>
                      <Text style={styles.historyPrice}>${total.toFixed(2)}</Text>
                    </View>
                  );
                })}
              </ScrollView>
              {purchaseEntries.length > pageSize && (
                <View style={styles.paginationRow}>
                  <Text style={styles.paginationText}>
                    Page {purchasePage} of {totalPages}
                  </Text>
                  <View style={styles.paginationButtons}>
                    <TouchableOpacity
                      style={[
                        styles.paginationButton,
                        purchasePage === 1 && styles.paginationButtonDisabled,
                      ]}
                      onPress={() => setPurchasePage(Math.max(1, purchasePage - 1))}
                      disabled={purchasePage === 1}
                    >
                      <Text style={styles.paginationButtonText}>Previous</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.paginationButton,
                        purchasePage >= totalPages && styles.paginationButtonDisabled,
                      ]}
                      onPress={() => setPurchasePage(Math.min(totalPages, purchasePage + 1))}
                      disabled={purchasePage >= totalPages}
                    >
                      <Text style={styles.paginationButtonText}>Next</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </Card>
          ) : (
            <Text style={styles.historyEmpty}>No purchases recorded yet.</Text>
          )}
        </View>

        {/* --- WASTE ANALYSIS --- */}
        <View style={[styles.section, { marginBottom: 40 }]}>
          <Text style={styles.sectionTitle}>Waste Analysis 🗑️</Text>
          <Card variant="elevated" style={styles.wasteCardOverride}>
            <Text style={styles.wasteMoney}>${calculateTotalWasteCost().toFixed(2)}</Text>
            <Text style={styles.wasteLabel}>Lost to food waste this month</Text>
          </Card>
        </View>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.background },
  container: { padding: Spacing.xl, paddingTop: 60 },
  section: { marginBottom: Spacing.xxl, width: '100%' },
  sectionTitle: { ...Typography.subHeader, marginBottom: Spacing.xs },

  insightAlert: { marginTop: Spacing.l, fontSize: 14, color: Colors.light.text, backgroundColor: Colors.light.secondary, padding: Spacing.m, borderRadius: BorderRadius.s, overflow: 'hidden' },

  // --- CARD OVERRIDES ---
  // We use Card for base styles, but override specific layout/padding needs here

  chartCardOverride: {
    paddingVertical: Spacing.s,
    paddingRight: Spacing.s,
    alignItems: 'center',
  },

  opportunityCardOverride: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.s,
    borderLeftWidth: 5,
    borderLeftColor: Colors.light.success
  },

  swapCardOverride: {
    flexDirection: 'row',
    marginBottom: Spacing.s,
    alignItems: 'center'
  },

  tableCardOverride: {
    padding: Spacing.s
  },

  wasteCardOverride: {
    backgroundColor: Colors.light.dangerBg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffcdd2'
  },

  // --- INTERNAL COMPONENT STYLES ---

  cardTitle: { fontSize: 16, fontWeight: '600', color: Colors.light.text },

  savingsBadge: { backgroundColor: Colors.light.successBg, paddingVertical: 6, paddingHorizontal: 12, borderRadius: BorderRadius.xl },
  savingsText: { color: Colors.light.success, fontWeight: 'bold', fontSize: 12 },

  suggestionTitle: { fontSize: 12, color: Colors.light.textSecondary, textAlign: 'right' },
  suggestionPrice: { fontSize: 16, fontWeight: 'bold', color: Colors.light.info, textAlign: 'right' },

  tableRow: { flexDirection: 'row', paddingVertical: Spacing.m, borderBottomWidth: 1, borderBottomColor: Colors.light.background },
  tableCell: { flex: 1, textAlign: 'center', fontSize: 15, color: Colors.light.text },

  historyCardOverride: {
    padding: Spacing.s,
    height: 360,
  },
  historyList: {
    flexGrow: 0,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.background,
  },
  historyMeta: {
    flex: 1,
    paddingRight: Spacing.m,
  },
  historyPrice: {
    fontWeight: '700',
    color: Colors.light.text,
  },
  paginationRow: {
    paddingTop: Spacing.s,
    gap: Spacing.s,
  },
  paginationText: {
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  paginationButtons: {
    flexDirection: 'row',
    gap: Spacing.s,
    justifyContent: 'center',
  },
  paginationButton: {
    backgroundColor: Colors.light.secondary,
    paddingVertical: Spacing.s,
    paddingHorizontal: Spacing.m,
    borderRadius: BorderRadius.m,
  },
  paginationButtonDisabled: {
    opacity: 0.5,
  },
  paginationButtonText: {
    color: Colors.light.text,
    fontWeight: '600',
  },
  historyEmpty: {
    color: Colors.light.textSecondary,
    marginTop: Spacing.s,
  },

  wasteMoney: { fontSize: 40, fontWeight: 'bold', color: Colors.light.danger },
  wasteLabel: { color: '#b71c1c', fontWeight: '600', marginTop: 5 }
});
