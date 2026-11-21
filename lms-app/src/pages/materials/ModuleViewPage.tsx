import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Edit2,
  ExternalLink,
  Eye,
  FileText,
  Plus,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { MaterialUpload } from '../../components/materials/MaterialUpload';
import { Badge, Button, Input, Modal, Table, Textarea } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { lmsService } from '../../lib/dataService';
import { toast } from '../../lib/toast';
import type {
  AttendanceRecord,
  Course,
  Material,
  MaterialAccessLog,
  Module,
} from '../../lib/types';

export default function ModuleViewPage() {
  const { courseId, moduleId } = useParams<{ courseId: string; moduleId: string }>();
  const { user, role } = useAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [currentModule, setCurrentModule] = useState<Module | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [attendanceRecord, setAttendanceRecord] = useState<AttendanceRecord | null>(null);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Material | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editModId, setEditModId] = useState('');
  const [editFile, setEditFile] = useState<File | undefined>();
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [logsTarget, setLogsTarget] = useState<Material | null>(null);
  const [accessLogs, setAccessLogs] = useState<MaterialAccessLog[]>([]);

  const loadModule = async () => {
    if (!courseId || !moduleId || !user) return;
    setLoading(true);
    setAccessDenied(null);
    try {
      const [c, allMods, allMats] = await Promise.all([
        lmsService.getCourseById(courseId),
        lmsService.listModules(courseId),
        lmsService.listMaterials(courseId),
      ]);

      setCourse(c);
      setModules(allMods);
      const mod = allMods.find((m) => m.id === moduleId) ?? null;
      setCurrentModule(mod);
      setMaterials(allMats.filter((m) => m.module_id === moduleId));

      // Requirement 8.1, 8.2, 9.1, 9.2: Verify active enrollment & automatically record attendance for Students
      if (role === 'student' && c && mod) {
        try {
          const att = await lmsService.recordModuleViewAttendance(courseId, moduleId, user.id);
          setAttendanceRecord(att);
        } catch (err) {
          setAccessDenied(
            (err as Error).message ||
              'Access denied: you are not actively enrolled in this course.',
          );
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModule();
  }, [courseId, moduleId, user, role]);

  const handleOpenMaterial = async (material: Material) => {
    if (!user) return;
    if (role === 'student') {
      await lmsService.recordMaterialAccess(user.id, material.id);
    }

    if (material.material_type === 'external_url' && material.external_url) {
      window.open(material.external_url, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      const url = material.file_data_url
        ? material.file_data_url
        : await lmsService.getSignedDownloadUrl('materials', material.file_path ?? material.title);
      const a = document.createElement('a');
      a.href = url;
      a.download = material.title;
      a.target = '_blank';
      a.click();
      toast.success(`Downloading "${material.title}"`);
    } catch (err) {
      toast.error((err as Error).message || 'Could not download file.');
    }
  };

  const openEditModal = (m: Material) => {
    setEditTarget(m);
    setEditTitle(m.title);
    setEditDesc(m.description ?? '');
    setEditModId(m.module_id ?? moduleId ?? '');
    setEditFile(undefined);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editTarget) return;
    setSavingEdit(true);
    try {
      await lmsService.updateMaterial(user.id, editTarget.id, {
        title: editTitle,
        description: editDesc,
        module_id: editModId,
        replacementFile: editFile,
      });
      toast.success('Material updated.');
      setEditTarget(null);
      await loadModule();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!user || !deleteTarget) return;
    setDeleting(true);
    try {
      await lmsService.deleteMaterial(user.id, deleteTarget.id);
      toast.success('Material deleted.');
      setDeleteTarget(null);
      await loadModule();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const openAccessLogs = async (m: Material) => {
    setLogsTarget(m);
    const logs = await lmsService.listMaterialAccessLogs(m.id);
    setAccessLogs(logs);
  };

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-white border border-[#E5E7EB]" />;
  }

  // Requirement 9.2: Deny access for unenrolled student
  if (accessDenied) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-[#1E1B4B]">Enrollment Required</h1>
        <p className="mt-1.5 text-sm text-red-600">{accessDenied}</p>
        <Link to="/courses" className="mt-5 inline-block">
          <Button>Return to Courses</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={`/courses/${courseId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6B7280] hover:text-[#7C5CFC]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {course?.subject_code ?? 'Course'}
        </Link>

        {role === 'professor' && (
          <Button size="sm" onClick={() => setUploadModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Material
          </Button>
        )}
      </div>

      {/* Automated Attendance Confirmation Banner for Students (Req 8.1, 9.1) */}
      {role === 'student' && attendanceRecord && (
        <div
          role="status"
          className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3.5 text-emerald-800"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold">
                Attendance Automatically Recorded —{' '}
                <span className="capitalize">{attendanceRecord.status}</span>
              </p>
              <p className="text-xs text-emerald-700">
                First viewed:{' '}
                {attendanceRecord.first_viewed_at
                  ? new Date(attendanceRecord.first_viewed_at).toLocaleString()
                  : 'Just now'}
              </p>
            </div>
          </div>
          <Badge variant={attendanceRecord.status}>{attendanceRecord.status}</Badge>
        </div>
      )}

      {/* Module Header */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-xs">
        <Badge variant="primary">Module {currentModule?.display_order ?? ''}</Badge>
        <h1 className="mt-2 text-xl font-bold text-[#1E1B4B]">
          {currentModule?.name ?? 'Module'}
        </h1>
        {currentModule?.description && (
          <p className="mt-1 text-sm text-[#6B7280]">{currentModule.description}</p>
        )}
      </div>

      {/* Materials List */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-[#1E1B4B]">
          Learning Materials ({materials.length})
        </h2>

        {materials.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D8D4F2] bg-white p-10 text-center text-sm text-[#6B7280]">
            No learning materials have been added to this module yet.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {materials.map((m) => (
              <div
                key={m.id}
                className="flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xs transition hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EDE9FE] text-[#7C5CFC]">
                      {m.material_type === 'external_url' ? (
                        <ExternalLink className="h-5 w-5" />
                      ) : (
                        <FileText className="h-5 w-5" />
                      )}
                    </div>
                    <Badge variant="neutral">
                      {m.material_type === 'external_url'
                        ? 'External Link'
                        : (m.mime_type?.split('/')[1]?.toUpperCase() ?? 'FILE')}
                    </Badge>
                  </div>

                  <h3 className="mt-3 text-base font-semibold text-[#1E1B4B]">{m.title}</h3>
                  {m.description && (
                    <p className="mt-1 text-xs text-[#6B7280]">{m.description}</p>
                  )}
                  <p className="mt-2 text-[11px] text-[#9CA3AF]">
                    Uploaded {new Date(m.uploaded_at).toLocaleDateString()}
                    {m.file_size_bytes
                      ? ` · ${(m.file_size_bytes / 1024 / 1024).toFixed(2)} MB`
                      : ''}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E7EB] pt-3">
                  <Button size="sm" variant="secondary" onClick={() => handleOpenMaterial(m)}>
                    {m.material_type === 'external_url' ? (
                      <>
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open Link
                      </>
                    ) : (
                      <>
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </>
                    )}
                  </Button>

                  {role === 'professor' && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openAccessLogs(m)}
                        title="View student access log"
                        className="rounded-lg p-1.5 text-[#6B7280] hover:bg-[#EDE9FE] hover:text-[#7C5CFC] cursor-pointer"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(m)}
                        title="Edit or replace file"
                        className="rounded-lg p-1.5 text-[#6B7280] hover:bg-gray-100 hover:text-[#1E1B4B] cursor-pointer"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(m)}
                        title="Delete material"
                        className="rounded-lg p-1.5 text-[#6B7280] hover:bg-red-50 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload Material Modal */}
      {user && courseId && moduleId && (
        <Modal
          isOpen={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          title="Add Learning Material"
          subtitle="Upload a course file or attach an external web resource."
        >
          <MaterialUpload
            professorId={user.id}
            courseId={courseId}
            moduleId={moduleId}
            onSuccess={() => {
              setUploadModalOpen(false);
              loadModule();
            }}
            onCancel={() => setUploadModalOpen(false)}
          />
        </Modal>
      )}

      {/* Edit / Replace File Modal */}
      <Modal
        isOpen={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title="Edit Material"
        subtitle="Update metadata, move to another module, or replace the uploaded file."
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <Input
            label="Title"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            required
          />
          <Textarea
            label="Description"
            rows={3}
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1E1B4B]">Module</label>
            <select
              value={editModId}
              onChange={(e) => setEditModId(e.target.value)}
              className="block w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#1E1B4B]"
            >
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          {editTarget?.material_type === 'file' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#1E1B4B]">
                Replace File (optional)
              </label>
              <input
                type="file"
                onChange={(e) => setEditFile(e.target.files?.[0])}
                className="block w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={savingEdit}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Learning Material"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" isLoading={deleting} onClick={handleConfirmDelete}>
              Confirm Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-[#6B7280]">
          Are you sure you want to delete <strong className="text-[#1E1B4B]">{deleteTarget?.title}</strong>?
          The associated file will be removed from storage.
        </p>
      </Modal>

      {/* Access Log Modal (Professor — Requirement 5.13) */}
      <Modal
        isOpen={Boolean(logsTarget)}
        onClose={() => setLogsTarget(null)}
        title={`Access Log — ${logsTarget?.title ?? ''}`}
        subtitle="Students who have opened or downloaded this material."
        maxWidthClass="max-w-2xl"
      >
        <Table
          rowKey={(r) => r.id}
          data={accessLogs}
          emptyMessage="No students have accessed this material yet."
          columns={[
            {
              key: 'student',
              header: 'Student',
              render: (r) => (
                <span className="font-medium text-[#1E1B4B]">{r.student_name ?? r.student_id}</span>
              ),
            },
            {
              key: 'email',
              header: 'Email',
              render: (r) => <span className="text-xs text-[#6B7280]">{r.student_email ?? '—'}</span>,
            },
            {
              key: 'time',
              header: 'Accessed At',
              render: (r) => (
                <span className="text-xs text-[#6B7280]">
                  {new Date(r.accessed_at).toLocaleString()}
                </span>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
}
