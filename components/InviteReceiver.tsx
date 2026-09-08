
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Modal } from './shared/Modal';

interface Invite {
    id: string;
    org_id: string;
    org_name: string;
    role: string;
    created_at: string;
    invited_by: string;
}

export const InviteReceiver: React.FC = () => {
    const { user, getToken } = useAuth();
    const [invites, setInvites] = useState<Invite[]>([]);
    const [currentInvite, setCurrentInvite] = useState<Invite | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (user) {
            checkInvites();
        }
    }, [user]);

    const checkInvites = async () => {
        try {
            const token = await getToken();
            const res = await fetch('/api/user_invites', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.invites && data.invites.length > 0) {
                    setInvites(data.invites);
                    setCurrentInvite(data.invites[0]);
                }
            }
        } catch (e) {
            console.error('Error checking invites:', e);
        }
    };

    const handleAction = async (action: 'accept' | 'decline') => {
        if (!currentInvite) return;
        setLoading(true);
        try {
            const token = await getToken();
            const res = await fetch('/api/user_invites', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ action, invite_id: currentInvite.id })
            });
            
            if (res.ok) {
                // Remove processed invite
                const remaining = invites.filter(i => i.id !== currentInvite.id);
                setInvites(remaining);
                if (remaining.length > 0) {
                    setCurrentInvite(remaining[0]);
                } else {
                    setCurrentInvite(null);
                    // Refresh page to apply changes (like org switch)
                    if (action === 'accept') {
                        window.location.reload();
                    }
                }
            } else {
                alert('Erro ao processar convite');
            }
        } catch (e) {
            console.error('Error processing invite:', e);
        } finally {
            setLoading(false);
        }
    };

    if (!currentInvite) return null;

    return (
        <Modal 
            isOpen={true} 
            onClose={() => {/* Prevent closing without action? Or maybe just allow dismiss */}}
            title="Convite para Organização"
        >
            <div className="space-y-4">
                <p className="text-gray-600 dark:text-gray-300">
                    Você foi convidado para participar da organização <strong>{currentInvite.org_name}</strong> como <strong>{currentInvite.role}</strong>.
                </p>
                <div className="flex justify-end gap-3 pt-4">
                    <button
                        onClick={() => handleAction('decline')}
                        disabled={loading}
                        className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        {loading ? 'Processando...' : 'Recusar'}
                    </button>
                    <button
                        onClick={() => handleAction('accept')}
                        disabled={loading}
                        className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
                    >
                        {loading ? 'Processando...' : 'Aceitar e Entrar'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};
