'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  BadgeCheck,
  CircleAlert,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import {
  Actions,
  Badge,
  Button,
  Card,
  CardHead,
  CardText,
  CardTitle,
  EmptyState,
  Eyebrow,
  Header,
  Hint,
  Lead,
  Notice,
  Page,
  StatCard,
  StatGrid,
  StatLabel,
  StatNote,
  StatValue,
  Table,
  TableWrap,
  Title,
} from '@/components/workspace/ai/primitives';
import {
  BILLING_TYPE_LABELS,
  REGULATED_REVIEW_NOTICE,
  SERVICE_STATUS_META,
  metaFor,
} from '@/components/workspace/phase2d/meta';
import CategoryForm from './CategoryForm';
import ServiceForm from './ServiceForm';

export default function ServicesView({ catalogue, canManage }) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [failure, setFailure] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [serviceFormCategoryId, setServiceFormCategoryId] = useState('');
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [confirmServiceId, setConfirmServiceId] = useState(null);

  const { categories, services, counts } = catalogue;
  const editingCategory = categories.find(
    (category) => category.id === editingCategoryId,
  );
  const editingService = services.find(
    (service) => service.id === editingServiceId,
  );

  function flash(text) {
    setFailure(null);
    setMessage(text);
    router.refresh();
  }

  function fail(error) {
    setMessage(null);
    setFailure(error.message);
  }

  function openNewService(categoryId = '') {
    setEditingServiceId(null);
    setShowCategoryForm(false);
    setServiceFormCategoryId(categoryId);
    setShowServiceForm(true);
  }

  async function toggleService(service) {
    setBusyId(service.id);
    setConfirmServiceId(null);
    setMessage(null);
    setFailure(null);
    try {
      const nextStatus = service.status === 'archived' ? 'active' : 'archived';
      await apiRequest(`/api/workforce/services/${service.id}`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      flash(
        nextStatus === 'archived'
          ? `"${service.name}" archived. Existing requirement links are kept.`
          : `"${service.name}" restored to the active catalogue.`,
      );
    } catch (error) {
      fail(error);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Page>
      <Header>
        <Eyebrow>Service catalogue</Eyebrow>
        <Title>Services, categories and regulated work</Title>
        <Lead>
          One configurable catalogue powers discovery and requirement capture.
          No prices are stored here; proposals decide commercial terms later.
        </Lead>
      </Header>

      {message ? (
        <Notice $tone="success">
          <BadgeCheck size={15} />
          <span>{message}</span>
        </Notice>
      ) : null}
      {failure ? (
        <Notice $tone="danger">
          <CircleAlert size={15} />
          <span>{failure}</span>
        </Notice>
      ) : null}

      <Notice $tone="warning">
        <ShieldAlert size={15} />
        <span>{REGULATED_REVIEW_NOTICE}</span>
      </Notice>

      <StatGrid>
        <StatCard>
          <StatLabel>Categories</StatLabel>
          <StatValue>{counts.categories}</StatValue>
          <StatNote>Configurable per workspace</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Services</StatLabel>
          <StatValue>{counts.services}</StatValue>
          <StatNote>Active and archived records shown</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Regulated services</StatLabel>
          <StatValue>{counts.regulated}</StatValue>
          <StatNote>Require a qualified professional</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Archived</StatLabel>
          <StatValue>{counts.archived}</StatValue>
          <StatNote>Hidden from requirement selection</StatNote>
        </StatCard>
      </StatGrid>

      {canManage ? (
        <Actions>
          <Button
            type="button"
            $variant="primary"
            onClick={() => {
              setEditingServiceId(null);
              setShowCategoryForm(false);
              setServiceFormCategoryId('');
              setShowServiceForm((value) => !value);
            }}
          >
            {showServiceForm ? <X size={14} /> : <Plus size={14} />}
            {showServiceForm ? 'Close service form' : 'New service'}
          </Button>
          <Button
            type="button"
            onClick={() => {
              setEditingServiceId(null);
              setShowServiceForm(false);
              setEditingCategoryId(null);
              setShowCategoryForm((value) => !value);
            }}
          >
            {showCategoryForm ? <X size={14} /> : <Layers size={14} />}
            {showCategoryForm ? 'Close category form' : 'New category'}
          </Button>
        </Actions>
      ) : (
        <Hint>
          You can view the catalogue. Only owners, admins and managers can
          change categories and services.
        </Hint>
      )}

      {showServiceForm && canManage ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Add a service</CardTitle>
              <CardText>
                Services appear in discovery and requirement capture. Archiving
                hides a service from new requirements without deleting history.
              </CardText>
            </div>
          </CardHead>
          <ServiceForm
            categories={categories}
            defaultCategoryId={serviceFormCategoryId}
            onDone={(result) => {
              setShowServiceForm(false);
              setServiceFormCategoryId('');
              flash(`"${result.service?.name ?? result.name}" added to the catalogue.`);
            }}
            onCancel={() => setShowServiceForm(false)}
          />
        </Card>
      ) : null}

      {showCategoryForm && canManage ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Add a category</CardTitle>
              <CardText>
                Categories group related services in the catalogue and in
                requirement selection.
              </CardText>
            </div>
          </CardHead>
          <CategoryForm
            onDone={(result) => {
              setShowCategoryForm(false);
              flash(`Category "${result.category?.name ?? result.name}" created.`);
            }}
            onCancel={() => setShowCategoryForm(false)}
          />
        </Card>
      ) : null}

      {categories.length === 0 ? (
        <Card>
          <EmptyState>
            <Layers size={17} aria-hidden="true" />
            <div>
              <h3>No catalogue categories yet</h3>
              <p>
                The starter catalogue is created the first time this page is
                opened. Reload the page, or add a category manually.
              </p>
            </div>
          </EmptyState>
        </Card>
      ) : null}

      {categories.map((category) => {
        const status = metaFor(SERVICE_STATUS_META, category.status);
        return (
          <Card key={category.id}>
            <CardHead>
              <div>
                <CardTitle>
                  {category.name}{' '}
                  <Badge $tone={status.tone}>{status.label}</Badge>
                </CardTitle>
                <CardText>
                  {category.description || 'No description recorded.'} ·{' '}
                  {category.services.length}{' '}
                  {category.services.length === 1 ? 'service' : 'services'}
                </CardText>
              </div>
              {canManage ? (
                <Actions>
                  <Button
                    type="button"
                    $variant="ghost"
                    onClick={() => {
                      setShowCategoryForm(false);
                      setShowServiceForm(false);
                      setEditingServiceId(null);
                      setEditingCategoryId((current) =>
                        current === category.id ? null : category.id,
                      );
                    }}
                  >
                    <Pencil size={13} />
                    Edit category
                  </Button>
                  <Button
                    type="button"
                    $variant="ghost"
                    onClick={() => openNewService(category.id)}
                  >
                    <Plus size={13} />
                    Add service
                  </Button>
                </Actions>
              ) : null}
            </CardHead>

            {editingCategory?.id === category.id && canManage ? (
              <div
                style={{
                  padding: 16,
                  border: '1px solid #E5EAF1',
                  borderRadius: 12,
                  marginBottom: 12,
                }}
              >
                <CategoryForm
                  key={category.id}
                  category={category}
                  onDone={() => {
                    setEditingCategoryId(null);
                    flash('Category updated.');
                  }}
                  onCancel={() => setEditingCategoryId(null)}
                />
              </div>
            ) : null}

            {category.services.length === 0 ? (
              <Hint>
                No services in this category yet. Add one, or restore an archived
                service.
              </Hint>
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Billing type</th>
                      <th>Regulated review</th>
                      <th>Status</th>
                      {canManage ? <th /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {category.services.map((service) => {
                      const serviceStatus = metaFor(
                        SERVICE_STATUS_META,
                        service.status,
                      );
                      const archived = service.status === 'archived';
                      return (
                        <tr key={service.id}>
                          <td>
                            {service.name}
                            {service.description ? (
                              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                {service.description}
                              </div>
                            ) : null}
                          </td>
                          <td>
                            {BILLING_TYPE_LABELS[service.billingType] ||
                              service.billingType}
                          </td>
                          <td>
                            {service.regulated ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Badge $tone="warning">
                                  {service.reviewProfession || 'Reviewer required'}
                                </Badge>
                                {service.reviewNotes ? (
                                  <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                    {service.reviewNotes}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            <Badge $tone={serviceStatus.tone}>
                              {serviceStatus.label}
                            </Badge>
                          </td>
                          {canManage ? (
                            <td>
                              {confirmServiceId === service.id ? (
                                <Actions>
                                  <Button
                                    type="button"
                                    $variant={archived ? 'primary' : 'danger'}
                                    onClick={() => toggleService(service)}
                                    disabled={busyId === service.id}
                                  >
                                    {busyId === service.id ? (
                                      <Loader2 size={13} className="spin" />
                                    ) : archived ? (
                                      <RotateCcw size={13} />
                                    ) : (
                                      <Archive size={13} />
                                    )}
                                    {archived ? 'Confirm restore' : 'Confirm archive'}
                                  </Button>
                                  <Button
                                    type="button"
                                    $variant="ghost"
                                    onClick={() => setConfirmServiceId(null)}
                                  >
                                    Cancel
                                  </Button>
                                </Actions>
                              ) : (
                                <Actions>
                                  <Button
                                    type="button"
                                    $variant="ghost"
                                    onClick={() => {
                                      setEditingCategoryId(null);
                                      setShowServiceForm(false);
                                      setEditingServiceId((current) =>
                                        current === service.id ? null : service.id,
                                      );
                                    }}
                                  >
                                    <Pencil size={13} />
                                    Edit
                                  </Button>
                                  <Button
                                    type="button"
                                    $variant="ghost"
                                    onClick={() => setConfirmServiceId(service.id)}
                                  >
                                    {archived ? (
                                      <RotateCcw size={13} />
                                    ) : (
                                      <Archive size={13} />
                                    )}
                                    {archived ? 'Restore' : 'Archive'}
                                  </Button>
                                </Actions>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}

            {editingService?.id && editingService.categoryId === category.id ? (
              <div
                style={{
                  padding: 16,
                  border: '1px solid #E5EAF1',
                  borderRadius: 12,
                  marginTop: 12,
                }}
              >
                <ServiceForm
                  key={editingService.id}
                  service={editingService}
                  categories={categories}
                  onDone={() => {
                    setEditingServiceId(null);
                    flash('Service updated.');
                  }}
                  onCancel={() => setEditingServiceId(null)}
                />
              </div>
            ) : null}
          </Card>
        );
      })}

      <Hint>
        Archiving a service stops it appearing in new requirement selection.
        Existing opportunities keep their linked requirement records.
      </Hint>
    </Page>
  );
}
