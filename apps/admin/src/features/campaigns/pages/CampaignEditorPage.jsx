import { CAMPAIGN, CUSTOMER_SEGMENTS, PERMISSIONS as P } from '@supershop/shared';
import { ArrowLeft, Calendar, Mail, MessageSquare, Send, Users, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { ArabicPreview } from '@/components/ArabicPreview';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Select } from '@/features/settings/components/controls';
import { can } from '@/lib/permissions';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import {
  campaigns,
  useAudienceCount,
  useCampaign,
  useCampaignDeliveries,
  useCancelCampaign,
  useScheduleCampaign,
  useSendCampaign,
  useSendTestCampaign,
} from '../resource';
import { CAMPAIGN_STATUS_STYLES } from '../status';

export function CampaignEditorPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { data: campaign, isPending, isError, error } = useCampaign(id);

  if (id && isPending) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (id && isError) {
    return (
      <div className="max-w-4xl mx-auto">
        <Alert variant="destructive">{errorMessage(t, error) || t('common.loadFailed')}</Alert>
      </div>
    );
  }

  return (
    <CampaignForm
      key={campaign ? `${campaign.id}:${campaign.updatedAt}` : 'new'}
      campaign={campaign}
    />
  );
}

function CampaignForm({ campaign }) {
  const isNew = !campaign;
  const id = campaign?.id;
  const { t } = useTranslation();
  const navigate = useNavigate();

  const createMutation = campaigns.useCreate();
  const updateMutation = campaigns.useUpdate();
  const scheduleMutation = useScheduleCampaign(id);
  const cancelMutation = useCancelCampaign(id);
  const sendMutation = useSendCampaign(id);
  const testMutation = useSendTestCampaign(id);

  const [name, setName] = useState(campaign?.name ?? '');
  const [selectedChannel, setSelectedChannel] = useState(campaign?.channel ?? 'email');
  const [selectedSegment, setSelectedSegment] = useState(
    campaign?.segment ?? CUSTOMER_SEGMENTS.ALL,
  );
  const [subject, setSubject] = useState(campaign?.subject?.en ?? '');
  const [message, setMessage] = useState(campaign?.message?.en ?? '');
  const [testRecipient, setTestRecipient] = useState('');
  const [scheduleDateTime, setScheduleDateTime] = useState(
    campaign?.scheduledAt ? new Date(campaign.scheduledAt).toISOString().slice(0, 16) : '',
  );

  const { data: audienceData } = useAudienceCount(selectedSegment, selectedChannel);
  const { data: deliveriesData } = useCampaignDeliveries(id, { limit: 50 });

  const isReadOnly = Boolean(campaign && campaign.status !== 'draft');

  const insertVariable = (variable) => {
    setMessage((prev) => `${prev} {{${variable}}}`);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const payload = {
      name,
      channel: selectedChannel,
      segment: selectedSegment,
      subject: selectedChannel === 'email' ? subject : undefined,
      message,
      scheduledAt: scheduleDateTime ? new Date(scheduleDateTime).toISOString() : null,
    };

    if (isNew) {
      createMutation.mutate(payload, {
        onSuccess: (saved) => {
          navigate(`/campaigns/${saved.id}`);
        },
      });
    } else {
      updateMutation.mutate({ id, body: payload });
    }
  };

  const handleSendNow = () => {
    if (window.confirm(t('campaigns.confirmSend'))) {
      sendMutation.mutate();
    }
  };

  const handleSchedule = () => {
    if (!scheduleDateTime) {
      alert(t('campaigns.selectScheduleDate'));
      return;
    }
    scheduleMutation.mutate({ scheduledAt: new Date(scheduleDateTime).toISOString() });
  };

  const handleCancelSchedule = () => {
    if (window.confirm(t('campaigns.confirmCancel'))) {
      cancelMutation.mutate();
    }
  };

  const handleSendTest = () => {
    if (!testRecipient) return;
    testMutation.mutate({
      channel: selectedChannel,
      to: testRecipient,
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Back button and title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/campaigns">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isNew ? t('campaigns.newCampaign') : campaign?.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isNew ? t('campaigns.newSubtitle') : t('campaigns.editSubtitle')}
            </p>
          </div>
        </div>

        {campaign && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={CAMPAIGN_STATUS_STYLES[campaign.status] ?? ''}>
              {t(`campaigns.statuses.${campaign.status}`)}
            </Badge>

            {can(P.CAMPAIGN_SEND) &&
              (campaign.status === 'draft' || campaign.status === 'scheduled') && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSendNow}
                  disabled={sendMutation.isPending}
                >
                  <Send className="size-3.5 me-1.5" />
                  {t('campaigns.sendNow')}
                </Button>
              )}

            {can(P.CAMPAIGN_MANAGE) && campaign.status === 'scheduled' && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={handleCancelSchedule}
                disabled={cancelMutation.isPending}
              >
                <XCircle className="size-3.5 me-1.5" />
                {t('campaigns.cancel')}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Campaign Metrics (if sent or sending) */}
      {campaign && (campaign.status === 'sent' || campaign.status === 'sending') && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardDescription>{t('campaigns.targeted')}</CardDescription>
              <CardTitle className="text-2xl">{campaign.stats?.targeted ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-emerald-600">
                {t('campaigns.delivered')}
              </CardDescription>
              <CardTitle className="text-2xl text-emerald-600">
                {campaign.stats?.sent ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-rose-600">{t('campaigns.failed')}</CardDescription>
              <CardTitle className="text-2xl text-rose-600">
                {campaign.stats?.failed ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardDescription>{t('campaigns.completedAt')}</CardDescription>
              <CardTitle className="text-sm font-medium mt-1">
                {campaign.completedAt ? fmt.dateTime(campaign.completedAt) : '—'}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Editor Form */}
      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('campaigns.detailsTitle')}</CardTitle>
            <CardDescription>{t('campaigns.detailsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Campaign Name */}
            <div className="space-y-1.5">
              <Label htmlFor="name">{t('campaigns.name')}</Label>
              <Input
                id="name"
                disabled={isReadOnly}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('campaigns.namePlaceholder')}
                required
              />
            </div>

            {/* Channel and Segment selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t('campaigns.channel')}</Label>
                <div className="flex gap-3">
                  <label
                    className={`flex-1 flex items-center justify-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedChannel === 'email'
                        ? 'border-primary bg-primary/5 text-primary font-medium'
                        : 'border-border text-muted-foreground'
                    } ${isReadOnly ? 'opacity-60 pointer-events-none' : ''}`}
                  >
                    <input
                      type="radio"
                      value="email"
                      disabled={isReadOnly}
                      className="sr-only"
                      checked={selectedChannel === 'email'}
                      onChange={() => setSelectedChannel('email')}
                    />
                    <Mail className="size-4" />
                    {t('campaigns.channelEmail')}
                  </label>

                  <label
                    className={`flex-1 flex items-center justify-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedChannel === 'sms'
                        ? 'border-primary bg-primary/5 text-primary font-medium'
                        : 'border-border text-muted-foreground'
                    } ${isReadOnly ? 'opacity-60 pointer-events-none' : ''}`}
                  >
                    <input
                      type="radio"
                      value="sms"
                      disabled={isReadOnly}
                      className="sr-only"
                      checked={selectedChannel === 'sms'}
                      onChange={() => setSelectedChannel('sms')}
                    />
                    <MessageSquare className="size-4" />
                    {t('campaigns.channelSms')}
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="segment">{t('campaigns.targetSegment')}</Label>
                <Select
                  value={selectedSegment}
                  disabled={isReadOnly}
                  onChange={(val) => setSelectedSegment(val)}
                  options={Object.values(CUSTOMER_SEGMENTS).map((seg) => ({
                    value: seg,
                    label: t(`customers.segments.${seg}`),
                  }))}
                />
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                  <Users className="size-3.5" />
                  <span>
                    {t('campaigns.audiencePreview', {
                      count: audienceData?.count ?? 0,
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* Email Subject */}
            {selectedChannel === 'email' && (
              <div className="space-y-1.5">
                <Label htmlFor="subject">{t('campaigns.subject')}</Label>
                <Input
                  id="subject"
                  disabled={isReadOnly}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t('campaigns.subjectPlaceholder')}
                  required={selectedChannel === 'email'}
                />
                {campaign?.subject?.ar && (
                  <ArabicPreview label={t('campaigns.subjectArabic')} value={campaign.subject} />
                )}
              </div>
            )}

            {/* Message Body */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="message">{t('campaigns.message')}</Label>
                {!isReadOnly && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground me-1">
                      {t('campaigns.insertVariable')}:
                    </span>
                    {CAMPAIGN.VARIABLES.map((v) => (
                      <Button
                        key={v}
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={() => insertVariable(v)}
                      >
                        {`{{${v}}}`}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <textarea
                id="message"
                rows={5}
                disabled={isReadOnly}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder={t('campaigns.messagePlaceholder')}
                required
              />
              {campaign?.message?.ar && (
                <ArabicPreview label={t('campaigns.messageArabic')} value={campaign.message} />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Scheduling & Actions (Only if draft or new) */}
        {!isReadOnly && (
          <Card>
            <CardHeader>
              <CardTitle>{t('campaigns.scheduleTitle')}</CardTitle>
              <CardDescription>{t('campaigns.scheduleDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1 space-y-1.5 w-full">
                  <Label htmlFor="scheduleTime">{t('campaigns.scheduleFor')}</Label>
                  <Input
                    id="scheduleTime"
                    type="datetime-local"
                    value={scheduleDateTime}
                    onChange={(e) => setScheduleDateTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-3">
                <Button
                  type="submit"
                  variant="outline"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {t('campaigns.saveDraft')}
                </Button>

                {scheduleDateTime && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleSchedule}
                    disabled={scheduleMutation.isPending}
                  >
                    <Calendar className="size-4 me-1.5" />
                    {t('campaigns.scheduleCampaign')}
                  </Button>
                )}

                {can(P.CAMPAIGN_SEND) && !isNew && (
                  <Button
                    type="button"
                    variant="default"
                    onClick={handleSendNow}
                    disabled={sendMutation.isPending}
                  >
                    <Send className="size-4 me-1.5" />
                    {t('campaigns.sendNow')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </form>

      {/* Test Message Panel */}
      {id && (
        <Card>
          <CardHeader>
            <CardTitle>{t('campaigns.testTitle')}</CardTitle>
            <CardDescription>{t('campaigns.testDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <Input
                placeholder={
                  selectedChannel === 'email'
                    ? t('campaigns.testEmailPlaceholder')
                    : t('campaigns.testPhonePlaceholder')
                }
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleSendTest}
                disabled={testMutation.isPending || !testRecipient}
              >
                {t('campaigns.sendTest')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delivery Logs (if campaign has started or finished) */}
      {id && deliveriesData?.data && deliveriesData.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('campaigns.deliveryLogs')}</CardTitle>
            <CardDescription>{t('campaigns.deliveryLogsDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('campaigns.recipient')}</TableHead>
                  <TableHead>{t('campaigns.channel')}</TableHead>
                  <TableHead>{t('campaigns.status')}</TableHead>
                  <TableHead>{t('campaigns.sentAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveriesData.data.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium text-xs">{d.recipient}</TableCell>
                    <TableCell className="text-xs uppercase">{d.channel}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          d.status === 'sent'
                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                        }
                      >
                        {d.status}
                      </Badge>
                      {d.error && <p className="text-xs text-destructive mt-0.5">{d.error}</p>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {d.sentAt ? fmt.dateTime(d.sentAt) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
