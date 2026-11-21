import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Lock, MessageSquare, Pin, Plus, Trash2, Unlock } from 'lucide-react';
import { Badge, Button, Input, Modal, Textarea } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { useRealtimeChannel } from '../../hooks/useRealtimeChannel';
import { lmsService } from '../../lib/dataService';
import { toast } from '../../lib/toast';
import type { Course, ForumThread } from '../../lib/types';
import { forumThreadSchema, MAX_FORUM_POST_LENGTH } from '../../lib/validators';

export default function ForumListPage() {
  const { courseId: routeCourseId } = useParams<{ courseId?: string }>();
  const { user, role } = useAuth();

  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState(routeCourseId ?? '');
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [errors, setErrors] = useState<{ title?: string; content?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user || !role) return;
    lmsService.listCourses(user.id, role).then((list) => {
      const active = list.filter((c) => !c.is_archived);
      setCourses(active);
      if (routeCourseId) {
        setSelectedCourseId(routeCourseId);
      } else if (!selectedCourseId && active[0]) {
        setSelectedCourseId(active[0].id);
      }
      if (active.length === 0) setLoading(false);
    });
  }, [user, role, routeCourseId]);

  const loadThreads = useCallback(async () => {
    if (!selectedCourseId) return;
    setLoading(true);
    try {
      const list = await lmsService.listForumThreads(selectedCourseId);
      setThreads(list);
    } finally {
      setLoading(false);
    }
  }, [selectedCourseId]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // Requirement 16.2 & 16.5: real-time updates on thread creation/moderation
  useRealtimeChannel(
    selectedCourseId ? `forum:${selectedCourseId}` : null,
    'forum_event',
    () => {
      loadThreads();
    },
  );

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !role || !selectedCourseId) return;
    setErrors({});

    const parsed = forumThreadSchema.safeParse({ title, content });
    if (!parsed.success) {
      const next: { title?: string; content?: string } = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'title') next.title = issue.message;
        if (issue.path[0] === 'content') next.content = issue.message;
      }
      setErrors(next);
      return;
    }

    setSubmitting(true);
    try {
      await lmsService.createForumThread({
        courseId: selectedCourseId,
        authorId: user.id,
        authorName: user.full_name,
        authorRole: role,
        title: parsed.data.title,
        content: parsed.data.content,
      });
      toast.success('Discussion thread created.');
      setTitle('');
      setContent('');
      setCreateOpen(false);
      await loadThreads();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleModerate = async (
    thread: ForumThread,
    action: { is_locked?: boolean; is_pinned?: boolean; delete?: boolean },
  ) => {
    if (!selectedCourseId) return;
    await lmsService.moderateThread(selectedCourseId, thread.id, action);
    toast.success(
      action.delete
        ? 'Thread deleted.'
        : action.is_pinned !== undefined
          ? action.is_pinned
            ? 'Thread pinned.'
            : 'Thread unpinned.'
          : action.is_locked
            ? 'Thread locked.'
            : 'Thread unlocked.',
    );
    await loadThreads();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1E1B4B]">Discussion Forums</h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Collaborate with classmates and professors in real time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            aria-label="Select course forum"
            className="rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2 text-sm text-[#1E1B4B]"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.subject_code} — {c.name}
              </option>
            ))}
          </select>

          <Button onClick={() => setCreateOpen(true)} disabled={!selectedCourseId}>
            <Plus className="h-4 w-4" />
            New Thread
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white border border-[#E5E7EB]" />
          ))}
        </div>
      ) : threads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D8D4F2] bg-white p-12 text-center">
          <MessageSquare className="mx-auto h-9 w-9 text-[#7C5CFC]" />
          <p className="mt-2 text-sm font-semibold text-[#1E1B4B]">No discussion threads yet</p>
          <p className="mt-1 text-xs text-[#6B7280]">Start a conversation for this course.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => (
            <div
              key={thread.id}
              className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xs transition hover:border-[#7C5CFC]/40 hover:shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#DDD6FE] bg-[#EDE9FE] text-sm font-bold text-[#7C5CFC]"
                  aria-hidden="true"
                >
                  {(thread.author_name ?? 'M')
                    .split(' ')
                    .map((part) => part[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {thread.is_pinned && (
                      <Badge variant="primary">
                        <Pin className="h-3 w-3" /> Pinned
                      </Badge>
                    )}
                    {thread.is_locked && (
                      <Badge variant="late">
                        <Lock className="h-3 w-3" /> Locked
                      </Badge>
                    )}
                  </div>
                  <h2 className="mt-1 text-base font-bold text-[#7C5CFC]">
                    {thread.title}
                  </h2>
                  <p className="mt-1 text-xs text-[#6B7280]">
                    <strong className="font-semibold text-[#374151]">{thread.author_name ?? 'Member'}</strong>
                    {thread.author_role ? ` · ${thread.author_role}` : ''} · Updated{' '}
                    {new Date(thread.updated_at).toLocaleString()}
                  </p>
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-2">
                  {role === 'professor' && (
                    <div className="hidden items-center gap-1 sm:flex">
                      <Button
                        size="sm"
                        variant="ghost"
                        title={thread.is_pinned ? 'Unpin thread' : 'Pin thread'}
                        onClick={() => handleModerate(thread, { is_pinned: !thread.is_pinned })}
                      >
                        <Pin className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title={thread.is_locked ? 'Unlock thread' : 'Lock thread'}
                        onClick={() => handleModerate(thread, { is_locked: !thread.is_locked })}
                      >
                        {thread.is_locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Delete thread"
                        onClick={() => handleModerate(thread, { delete: true })}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  )}

                  <Link to={`/courses/${selectedCourseId}/forums/${thread.id}`}>
                    <Button size="sm" className="whitespace-nowrap">
                      Check the Discussion
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="mt-4 h-px w-full bg-[#E5E7EB]" />
            </div>
          ))}
        </div>
      )}

      {/* New Thread Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Start a Discussion Thread"
        subtitle="Posts must be non-empty and up to 10,000 characters."
      >
        <form onSubmit={handleCreateThread} noValidate className="space-y-4">
          <Input
            label="Thread Title"
            placeholder="e.g. Question about Module 2 AVL Rotations"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={errors.title}
          />
          <Textarea
            label="Initial Message"
            rows={5}
            placeholder="Write your question or topic..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            error={errors.content}
            helperText={`${content.length.toLocaleString()} / ${MAX_FORUM_POST_LENGTH.toLocaleString()} characters`}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={submitting}>
              Post Thread
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
