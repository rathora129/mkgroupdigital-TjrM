'use client';

import { useRouter } from 'next/navigation';
import ClientCreateForm from './ClientCreateForm';

export default function ClientCreateView({ leads, members }) {
  const router = useRouter();

  return (
    <ClientCreateForm
      leads={leads}
      members={members}
      onDone={(result) => {
        if (result?.client?.id) {
          router.push(`/workspace/clients/${result.client.id}`);
        } else {
          router.push('/workspace/clients');
        }
        router.refresh();
      }}
      onCancel={() => router.push('/workspace/clients')}
    />
  );
}
