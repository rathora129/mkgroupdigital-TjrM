'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderKanban } from 'lucide-react';
import {
  Card,
  Eyebrow,
  Header,
  Lead,
  Notice,
  Page,
  Title,
} from '@/components/workspace/ai/primitives';
import ProjectCreateForm from './ProjectCreateForm';

export default function ProjectCreateView({ options, members }) {
  const router = useRouter();

  return (
    <Page>
      <Header>
        <Eyebrow>
          <Link href="/workspace/projects">Projects</Link> · New
        </Eyebrow>
        <Title>Create a delivery project</Title>
        <Lead>
          A project starts from an accepted proposal. The accepted version is
          snapshotted, its deliverables and milestones are copied, and the
          proposal itself is never modified.
        </Lead>
      </Header>

      <Notice $tone="info">
        <FolderKanban size={15} />
        <span>
          Each accepted proposal can create exactly one project. Create a new
          proposal revision if the scope changed before acceptance.
        </span>
      </Notice>

      <Card>
        <ProjectCreateForm
          options={options}
          members={members}
          onDone={(project) => {
            router.push(`/workspace/projects/${project.project.id}`);
          }}
          onCancel={() => router.push('/workspace/projects')}
        />
      </Card>
    </Page>
  );
}
