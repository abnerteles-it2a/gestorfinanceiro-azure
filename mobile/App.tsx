import './global.css';
import 'react-native-gesture-handler';
import React, { useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';

// ─── Auth & Data ───────────────────────────────────────────────────────────────
import { AuthProvider, useAuth } from './context/AuthContext';
import { FinancialDataProvider } from './context/FinancialDataContext';

// ─── Shell Components ──────────────────────────────────────────────────────────
import { ErrorBoundary } from './components/ErrorBoundary';
import { SubscriptionGate } from './components/SubscriptionGate';

// ─── Auth Screens ──────────────────────────────────────────────────────────────
import { LoginScreen } from './screens/LoginScreen';
import { SignUpScreen } from './screens/SignUpScreen';

// ─── Tab Screens ───────────────────────────────────────────────────────────────
import { DashboardScreen } from './screens/DashboardScreen';
import { CashFlowScreen } from './screens/CashFlowScreen';
import { InvestmentsScreen } from './screens/InvestmentsScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { MenuScreen } from './screens/MenuScreen';

// ─── Stack Screens ─────────────────────────────────────────────────────────────
import { ChatbotScreen } from './screens/ChatbotScreen';
import { AccountsScreen } from './screens/AccountsScreen';
import { CategoriesScreen } from './screens/CategoriesScreen';
import { GoalsScreen } from './screens/GoalsScreen';
import { CostCentersScreen } from './screens/CostCentersScreen';
import { PayablesScreen } from './screens/PayablesScreen';
import { ReceivablesScreen } from './screens/ReceivablesScreen';
import { RecurrencesScreen } from './screens/RecurrencesScreen';
import { SmartInvestmentScreen } from './screens/SmartInvestmentScreen';

// ─── Modal Screens ─────────────────────────────────────────────────────────────
import { TransactionFormScreen } from './screens/TransactionFormScreen';
import { AccountFormScreen } from './screens/AccountFormScreen';
import { CategoryFormScreen } from './screens/CategoryFormScreen';
import { InvestmentFormScreen } from './screens/InvestmentFormScreen';
import { GoalFormScreen } from './screens/GoalFormScreen';
import { CostCenterFormScreen } from './screens/CostCenterFormScreen';
import { RecurrenceFormScreen } from './screens/RecurrenceFormScreen';

// ─── Navigation Theme ──────────────────────────────────────────────────────────
const MyDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#020817',
    card: '#0B1E3B',
    text: '#ffffff',
    border: '#1e293b',
    primary: '#0D9488',
  },
};

const MyLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#f8fafc',
    card: '#ffffff',
    text: '#0f172a',
    border: '#e2e8f0',
    primary: '#0D9488',
  },
};

// ─── Navigators ────────────────────────────────────────────────────────────────
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  const { colorScheme } = useColorScheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#0D9488',
        tabBarInactiveTintColor: colorScheme === 'dark' ? '#94a3b8' : '#64748b',
        tabBarStyle: {
          backgroundColor: colorScheme === 'dark' ? '#0B1E3B' : '#ffffff',
          borderTopColor: colorScheme === 'dark' ? '#1e293b' : '#e2e8f0',
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, [string, string]> = {
            Dashboard: ['home', 'home-outline'],
            Fluxo: ['list', 'list-outline'],
            InvestmentsTab: ['trending-up', 'trending-up-outline'],
            Reports: ['bar-chart', 'bar-chart-outline'],
            Menu: ['menu', 'menu-outline'],
          };
          const [active, inactive] = icons[route.name] ?? ['ellipse', 'ellipse-outline'];
          return <Ionicons name={(focused ? active : inactive) as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ tabBarLabel: 'Início' }} />
      <Tab.Screen name="Fluxo" component={CashFlowScreen} options={{ tabBarLabel: 'Fluxo' }} />
      <Tab.Screen name="InvestmentsTab" component={InvestmentsScreen} options={{ tabBarLabel: 'Investir' }} />
      <Tab.Screen name="Reports" component={ReportsScreen} options={{ tabBarLabel: 'Relatórios' }} />
      <Tab.Screen name="Menu" component={MenuScreen} options={{ tabBarLabel: 'Menu' }} />
    </Tab.Navigator>
  );
}

// ─── Auth Navigator (sem NavigationContainer) ──────────────────────────────────


function AuthNavigator({ onNavigateSignUp, onBack, showSignUp }: {
  onNavigateSignUp: () => void;
  onBack: () => void;
  showSignUp: boolean;
}) {
  const { colorScheme } = useColorScheme();
  return (
    <>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      {showSignUp ? (
        <SignUpScreen onBack={onBack} />
      ) : (
        <LoginScreen onNavigateSignUp={onNavigateSignUp} />
      )}
    </>
  );
}

// ─── App Router ────────────────────────────────────────────────────────────────
function AppNavigator() {
  const { token, user, loading } = useAuth();
  const { colorScheme } = useColorScheme();
  const [showSignUp, setShowSignUp] = useState(false);

  // Loading splash — não montamos NavigationContainer ainda
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#020817' }}>
        <ActivityIndicator size="large" color="#0D9488" />
      </View>
    );
  }

  // Auth flow — sem NavigationContainer (não há navegação ainda)
  if (!token || !user) {
    return (
      <AuthNavigator
        showSignUp={showSignUp}
        onNavigateSignUp={() => setShowSignUp(true)}
        onBack={() => setShowSignUp(false)}
      />
    );
  }

  // App principal — NavigationContainer montado UMA VEZ após login confirmado
  return (
    <FinancialDataProvider>
      <SubscriptionGate>
        <NavigationContainer
          theme={colorScheme === 'dark' ? MyDarkTheme : MyLightTheme}
        >
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {/* Root tabs */}
            <Stack.Screen name="Main" component={MainTabs} />

            {/* Stack screens */}
            <Stack.Screen name="Chatbot" component={ChatbotScreen} />
            <Stack.Screen name="Accounts" component={AccountsScreen} />
            <Stack.Screen name="Categories" component={CategoriesScreen} />
            <Stack.Screen name="Goals" component={GoalsScreen} />
            <Stack.Screen name="CostCenters" component={CostCentersScreen} />
            <Stack.Screen name="Payables" component={PayablesScreen} />
            <Stack.Screen name="Receivables" component={ReceivablesScreen} />
            <Stack.Screen name="Recurrences" component={RecurrencesScreen} />
            <Stack.Screen name="SmartInvestment" component={SmartInvestmentScreen} />
            <Stack.Screen name="Investments" component={InvestmentsScreen} />

            {/* Modals */}
            <Stack.Screen name="TransactionForm" component={TransactionFormScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="AccountForm" component={AccountFormScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="CategoryForm" component={CategoryFormScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="InvestmentForm" component={InvestmentFormScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="GoalForm" component={GoalFormScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="CostCenterForm" component={CostCenterFormScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="RecurrenceForm" component={RecurrenceFormScreen} options={{ presentation: 'modal' }} />
          </Stack.Navigator>
        </NavigationContainer>
      </SubscriptionGate>
    </FinancialDataProvider>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
