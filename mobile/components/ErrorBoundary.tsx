import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('=== CRASH REPORT ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('Component Stack:', errorInfo.componentStack);
    console.error('===================');
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      const errMsg = this.state.error?.message ?? 'Unknown error';
      const errStack = this.state.error?.stack ?? '';
      const compStack = this.state.errorInfo?.componentStack ?? '';

      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#1e1b4b' }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
          >
            {/* Header */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ color: '#a5b4fc', fontSize: 10, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
                Erro de Aplicação
              </Text>
              <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '900' }}>
                Ops! Algo deu errado
              </Text>
            </View>

            {/* Error message */}
            <View style={{ backgroundColor: '#ef4444', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700', marginBottom: 4 }}>
                Mensagem do Erro:
              </Text>
              <Text style={{ color: '#fef2f2', fontSize: 12, fontFamily: 'monospace' }}>
                {errMsg}
              </Text>
            </View>

            {/* Stack trace */}
            {errStack.length > 0 && (
              <View style={{ backgroundColor: '#1f2937', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <Text style={{ color: '#9ca3af', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  Stack Trace:
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Text style={{ color: '#d1d5db', fontSize: 10, fontFamily: 'monospace', lineHeight: 16 }}>
                    {errStack}
                  </Text>
                </ScrollView>
              </View>
            )}

            {/* Component tree */}
            {compStack.length > 0 && (
              <View style={{ backgroundColor: '#111827', borderRadius: 12, padding: 16, marginBottom: 24 }}>
                <Text style={{ color: '#9ca3af', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  Componente que falhou:
                </Text>
                <Text style={{ color: '#6b7280', fontSize: 10, fontFamily: 'monospace', lineHeight: 16 }}>
                  {compStack}
                </Text>
              </View>
            )}

            {/* Retry */}
            <TouchableOpacity
              onPress={() => this.setState({ hasError: false, error: null, errorInfo: null })}
              style={{ backgroundColor: '#4f46e5', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 }}
            >
              <Text style={{ color: '#ffffff', fontWeight: '900', fontSize: 14 }}>
                Tentar Novamente
              </Text>
            </TouchableOpacity>

            <Text style={{ color: '#6b7280', fontSize: 10, textAlign: 'center', fontStyle: 'italic' }}>
              Anote a mensagem acima e envie ao suporte
            </Text>
          </ScrollView>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}
