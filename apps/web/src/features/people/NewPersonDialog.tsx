'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adminApi } from '@/features/admin/client';
import type { PersonAggregate } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

/** Manual creation of a canonical person (idea.md §10 — admin always chooses). */
export function NewPersonDialog() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [nickname, setNickname] = useState('');
  const [livingStatus, setLivingStatus] = useState('unknown');
  const [privacyLevel, setPrivacyLevel] = useState('private');

  const create = useMutation({
    mutationFn: () =>
      adminApi.post<PersonAggregate>('/api/admin/people', {
        firstName: firstName.trim(),
        surname: surname.trim() || undefined,
        nickname: nickname.trim() || undefined,
        livingStatus,
        privacyLevel,
      }),
    onSuccess: (person) => {
      toast.success('Човекът е създаден');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'people'] });
      setOpen(false);
      router.push(`/admin/people/${person.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Нов човек</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Нов човек</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="np-first">Име *</Label>
            <Input id="np-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="np-surname">Фамилия</Label>
            <Input id="np-surname" value={surname} onChange={(e) => setSurname(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="np-nick">Прякор</Label>
            <Input id="np-nick" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Статус</Label>
              <Select value={livingStatus} onValueChange={setLivingStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unknown">Неизвестно</SelectItem>
                  <SelectItem value="living">Жив/а</SelectItem>
                  <SelectItem value="deceased">Починал/а</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Поверителност</Label>
              <Select value={privacyLevel} onValueChange={setPrivacyLevel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Частно</SelectItem>
                  <SelectItem value="family">Семейно</SelectItem>
                  <SelectItem value="public">Публично</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!firstName.trim() || create.isPending} onClick={() => create.mutate()}>
            Създай
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
