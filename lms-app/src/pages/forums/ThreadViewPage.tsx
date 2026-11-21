import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Lock, Pin, Send, Trash2, Unlock } from 'lucide-react';
import { Badge, Button, Textarea } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { useRealtimeChannel } from '../../hooks/useRealtimeChannel';
import { lmsService } from '../../lib/dataService';
import { toast } from '../../lib/toast';
import type { ForumPost, ForumThread } from '../../lib/types';
import { forumPostSchema, MAX_FORUM_POST_LENGTH } from '../../lib/validators';

export default function ThreadViewPage() {
  const { courseId, threadId } = useParams<{ courseId: string; threadId: string }>();
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const [thread, setThread] = useState<ForumThread | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [replyContent, setReplyContent] = useState('');
  const [replyError, setReplyError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadThread = useCallback(async () => {
    if (!courseId || !threadId) return;
    setLoading(true);
    try {
      const [allThreads, threadPosts] = await Promise.all([
        lmsService.listForumThreads(courseId),
        lmsService.listForumPosts(threadId),
      ]);
      setThread(allThreads.find((t) => t.id === threadId) ?? null);
      setPosts(threadPosts);
    } finally {
      setLoading(false);
    }
  }, [courseId, threadId]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  // Real-time forum updates via Broadcast channel (Requirement 16.2 & 16.5)
  useRealtimeChannel(
    courseId ? `forum:${courseId}` : null,
    'forum_event',
    () => {
      loadThread();
    },
  );

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !role || !courseId || !threadId) return;
    setReplyError(undefined);

    const parsed = forumPostSchema.safeParse({ content: replyContent });
    if (!parsed.success) {
      setReplyError(parsed.error.issues[0]?.message ?? 'Invalid post content.');
      return;
    }

    setSubmitting(true);
    try {
      await lmsService.createForumPost({
        courseId,
        threadId,
        authorId: user.id,
        authorName: user.full_name,
        authorRole: role,
        content: parsed.data.content,
      });
      setReplyContent('');
      await loadThread();
    } catch (err) {
      setReplyError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!courseId) return;
    await lmsService.deleteForumPost(courseId, postId);
    toast.success('Post removed.');
    await loadThread();
  };

  const handleToggleLock = async () => {
    if (!courseId || !thread) return;
    await lmsService.moderateThread(courseId, thread.id, { is_locked: !thread.is_locked });
    toast.success(thread.is_locked ? 'Thread unlocked.' : 'Thread locked.');
    await loadThread();
  };

  const handleTogglePin = async () => {
    if (!courseId || !thread) return;
    await lmsService.moderateThread(courseId, thread.id, { is_pinned: !thread.is_pinned });
    toast.success(thread.is_pinned ? 'Thread unpinned.' : 'Thread pinned.');
    await loadThread();
  };

  const handleDeleteThread = async () => {
    if (!courseId || !thread) return;
    await lmsService.moderateThread(courseId, thread.id, { delete: true });
    toast.success('Thread deleted.');
    navigate(`/courses/${courseId}/forums`);
  };

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-white border border-[#E5E7EB]" />;
  }

  if (!thread) {
    return (
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-10 text-center">
        <p className="text-sm font-semibold text-[#1E1B4B]">Thread not found or has been deleted.</p>
        <Link to={`/courses/${courseId}/forums`} className="mt-4 inline-block">
          <Button size="sm">Back to Forum</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        to={`/courses/${courseId}/forums`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6B7280] hover:text-[#7C5CFC]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Forum Threads
      </Link>

      {/* Thread Header */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#DDD6FE] bg-[#EDE9FE] text-sm font-bold text-[#7C5CFC]"
              aria-hidden="true"
            >
              {(thread.author_name ?? 'Member')
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
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
              <h1 className="mt-2 text-xl font-bold text-[#7C5CFC]">{thread.title}</h1>
              <p className="mt-1 text-xs text-[#6B7280]">
                <strong className="font-semibold text-[#374151]">{thread.author_name ?? 'Member'}</strong>
                {thread.author_role ? ` · ${thread.author_role}` : ''} ·{' '}
                {new Date(thread.created_at).toLocaleString()}
              </p>
            </div>
          </div>

          {role === 'professor' && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleTogglePin}>
                <Pin className="h-3.5 w-3.5" />
                {thread.is_pinned ? 'Unpin' : 'Pin'}
              </Button>
              <Button size="sm" variant="outline" onClick={handleToggleLock}>
                {thread.is_locked ? (
                  <>
                    <Unlock className="h-3.5 w-3.5" /> Unlock
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" /> Lock
                  </>
                )}
              </Button>
              <Button size="sm" variant="danger" onClick={handleDeleteThread}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          )}
        </div>
        <div className="mt-5 h-px w-full bg-[#E5E7EB]" />
      </div>

      {/* Posts List */}
      <div className="space-y-3">
        {posts.map((post) => (
          <article
            key={post.id}
            className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xs space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#1E1B4B]">
                  {post.author_name ?? 'Member'}
                </span>
                {post.author_role && (
                  <Badge variant={post.author_role === 'professor' ? 'primary' : 'neutral'}>
                    {post.author_role}
                  </Badge>
                )}
                <span className="text-xs text-[#9CA3AF]">
                  {new Date(post.created_at).toLocaleString()}
                </span>
              </div>

              {role === 'professor' && (
                <button
                  type="button"
                  onClick={() => handleDeletePost(post.id)}
                  title="Delete post"
                  className="rounded-lg p-1 text-[#9CA3AF] hover:bg-red-50 hover:text-red-600 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#374151]">
              {post.content}
            </p>
          </article>
        ))}
      </div>

      {/* Reply Composer or Locked Banner (Requirement 16.4) */}
      {thread.is_locked ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <Lock className="h-4 w-4 shrink-0" />
          This thread has been locked by the professor. Existing posts remain visible, but new
          replies are disabled.
        </div>
      ) : (
        <form
          onSubmit={handleReply}
          noValidate
          className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xs space-y-3"
        >
          <Textarea
            label="Post a Reply"
            rows={4}
            placeholder="Write your reply..."
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            error={replyError}
            helperText={`${replyContent.length.toLocaleString()} / ${MAX_FORUM_POST_LENGTH.toLocaleString()} characters`}
          />
          <div className="flex justify-end">
            <Button type="submit" isLoading={submitting}>
              <Send className="h-4 w-4" />
              Post Reply
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
