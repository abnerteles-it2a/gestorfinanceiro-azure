import React from 'react';
import { View, ScrollView, StatusBar, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';

interface PortalLayoutProps {
    children: React.ReactNode;
    title?: string;
    headerContent?: React.ReactNode;
}

/**
 * PortalLayout - The core layout for the Gestor Financeiro mobile ecosystem.
 * Uses useSafeAreaInsets for correct Android status bar handling.
 */
export const PortalLayout: React.FC<PortalLayoutProps> = ({ children, headerContent }) => {
    const { colorScheme } = useColorScheme();
    const insets = useSafeAreaInsets();

    return (
        <View style={{ flex: 1, backgroundColor: colorScheme === 'dark' ? '#020817' : '#0F766E' }}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            {/* Top Branding Area — padded by real inset */}
            <View style={{ paddingTop: insets.top, paddingHorizontal: 24, paddingBottom: 20 }}>
                {headerContent}
            </View>

            {/* Main Portal Content with Rounded Frame */}
            <View style={{
                flex: 1,
                backgroundColor: colorScheme === 'dark' ? '#041226' : '#ffffff',
                borderTopLeftRadius: 32,
                borderTopRightRadius: 32,
                borderTopWidth: 1,
                borderColor: colorScheme === 'dark' ? '#0B1E3B' : '#e2e8f0',
                overflow: 'hidden',
            }}>
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{
                        padding: 20,
                        paddingBottom: Platform.OS === 'ios' ? 40 : 60,
                    }}
                    showsVerticalScrollIndicator={false}
                >
                    {children}
                </ScrollView>
            </View>
        </View>
    );
};

