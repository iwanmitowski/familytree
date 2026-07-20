'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/features/admin/client';
import type { ContactLead, Invite, InviteWithToken } from '@/features/admin/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

function shareUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/questionnaire?invite=${encodeURIComponent(token)}`;
}

export default function InvitesPage() {
  const queryClient = useQueryClient();
  const [recipientLabel, setRecipientLabel] = useState('');
  const [campaign, setCampaign] = useState('');
  const [maxSubmissions, setMaxSubmissions] = useState('1');
  const [created, setCreated] = useState<InviteWithToken | null>(null);

  const invites = useQuery({
    queryKey: ['admin', 'invites'],
    queryFn: () => adminApi.get<{ items: Invite[] }>('/api/admin/invites'),
  });
  const leads = useQuery({
    queryKey: ['admin', 'contact-leads'],
    queryFn: () => adminApi.get<{ items: ContactLead[] }>('/api/admin/contact-leads'),
  });

  const create = useMutation({
    mutationFn: (body: { recipientLabel: string; campaign?: string; maxSubmissions: number }) =>
      adminApi.post<InviteWithToken>('/api/admin/invites', body),
    onSuccess: (invite) => {
      setCreated(invite);
      setRecipientLabel('');
      setCampaign('');
      setMaxSubmissions('1');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => adminApi.post(`/api/admin/invites/${id}/revoke`),
    onSuccess: () => {
      toast.success('Анулирана');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function prefillFromLead(lead: ContactLead) {
    setRecipientLabel(lead.name);
    setCampaign('snowball');
  }

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Покани</h1>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Нова покана</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!recipientLabel.trim()) return;
                create.mutate({
                  recipientLabel: recipientLabel.trim(),
                  campaign: campaign.trim() || undefined,
                  maxSubmissions: Math.max(1, Number(maxSubmissions) || 1),
                });
              }}
            >
              <div>
                <Label htmlFor="recipientLabel">Получател</Label>
                <Input id="recipientLabel" value={recipientLabel} onChange={(e) => setRecipientLabel(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="campaign">Кампания</Label>
                <Input id="campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="maxSubmissions">Макс. брой</Label>
                <Input id="maxSubmissions" type="number" min={1} value={maxSubmissions} onChange={(e) => setMaxSubmissions(e.target.value)} />
              </div>
              <div className="sm:col-span-3">
                <Button type="submit" disabled={create.isPending}>
                  Създай покана
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {invites.data && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Съществуващи покани</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {invites.data.items.length === 0 && (
                <p className="text-sm text-muted-foreground">Все още няма покани.</p>
              )}
              {invites.data.items.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-4 border-b py-2 text-sm">
                  <div>
                    <span className="font-medium">{inv.recipientLabel}</span>
                    {inv.campaign && <span className="ml-2 text-muted-foreground">· {inv.campaign}</span>}
                    <span className="ml-2 text-muted-foreground">
                      {inv.usedSubmissions}/{inv.maxSubmissions}
                    </span>
                    {inv.revokedAt && <Badge variant="destructive" className="ml-2">Анулирана</Badge>}
                    {inv.expired && <Badge variant="outline" className="ml-2">Изтекла</Badge>}
                  </div>
                  {!inv.revokedAt && (
                    <Button variant="ghost" size="sm" onClick={() => revoke.mutate(inv.id)}>
                      Анулирай
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Потенциални контакти</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {leads.data?.items.length === 0 && (
            <p className="text-sm text-muted-foreground">Няма предложени контакти.</p>
          )}
          {leads.data?.items.map((lead, i) => (
            <div key={i} className="flex items-center justify-between gap-4 border-b py-2 text-sm">
              <div>
                <span className="font-medium">{lead.name || 'Без име'}</span>
                <Badge variant="outline" className="ml-2">
                  {lead.kind === 'participant' ? 'участник' : 'препоръчан'}
                </Badge>
                {lead.contactHint && <span className="ml-2 text-muted-foreground">{lead.contactHint}</span>}
              </div>
              <Button variant="outline" size="sm" onClick={() => prefillFromLead(lead)}>
                Създай покана
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!created} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Поканата е създадена</DialogTitle>
          </DialogHeader>
          {created && (
            <div className="grid gap-3 text-sm">
              <p className="text-muted-foreground">
                Токенът се показва само сега. Копирайте линка и го изпратете на роднината.
              </p>
              <div className="flex gap-2">
                <Input readOnly value={shareUrl(created.token)} />
                <Button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(shareUrl(created.token));
                    toast.success('Копиран линк');
                  }}
                >
                  Копирай
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
