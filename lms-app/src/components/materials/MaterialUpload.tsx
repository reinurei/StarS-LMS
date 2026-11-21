import { useState } from 'react';
import { Link2, Upload } from 'lucide-react';
import { Button, Input, Textarea } from '../ui';
import { lmsService } from '../../lib/dataService';
import { toast } from '../../lib/toast';
import { validateExternalUrl, validateMaterialUpload } from '../../lib/validators';

interface MaterialUploadProps {
  professorId: string;
  courseId: string;
  moduleId: string;
  onSuccess: () => void;
  onCancel?: () => void;
}

export function MaterialUpload({
  professorId,
  courseId,
  moduleId,
  onSuccess,
  onCancel,
}: MaterialUploadProps) {
  const [materialType, setMaterialType] = useState<'file' | 'external_url'>('file');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const chosen = e.target.files?.[0] ?? null;
    if (!chosen) {
      setFile(null);
      return;
    }
    const validation = validateMaterialUpload(chosen);
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid file.');
      setFile(null);
      return;
    }
    setFile(chosen);
    if (!title.trim()) {
      setTitle(chosen.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Material title is required.');
      return;
    }

    if (materialType === 'file') {
      if (!file) {
        setError('Please select a valid file to upload.');
        return;
      }
      const check = validateMaterialUpload(file);
      if (!check.valid) {
        setError(check.error ?? 'Invalid file.');
        return;
      }
    } else {
      const urlCheck = validateExternalUrl(externalUrl.trim());
      if (!urlCheck.valid) {
        setError(urlCheck.error ?? 'Invalid URL.');
        return;
      }
    }

    setSubmitting(true);
    try {
      await lmsService.createMaterial(professorId, {
        course_id: courseId,
        module_id: moduleId,
        title: title.trim(),
        description: description.trim(),
        material_type: materialType,
        file: materialType === 'file' ? file ?? undefined : undefined,
        external_url: materialType === 'external_url' ? externalUrl.trim() : undefined,
      });
      toast.success('Learning material added and enrolled students notified.');
      setTitle('');
      setDescription('');
      setFile(null);
      setExternalUrl('');
      onSuccess();
    } catch (err) {
      setError((err as Error).message || 'Upload failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setMaterialType('file');
            setError(null);
          }}
          className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition cursor-pointer ${
            materialType === 'file'
              ? 'border-[#7C5CFC] bg-[#EDE9FE] text-[#7C5CFC]'
              : 'border-[#E5E7EB] bg-white text-[#6B7280]'
          }`}
        >
          <Upload className="h-4 w-4" />
          Upload File (≤ 500 MB)
        </button>
        <button
          type="button"
          onClick={() => {
            setMaterialType('external_url');
            setError(null);
          }}
          className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition cursor-pointer ${
            materialType === 'external_url'
              ? 'border-[#7C5CFC] bg-[#EDE9FE] text-[#7C5CFC]'
              : 'border-[#E5E7EB] bg-white text-[#6B7280]'
          }`}
        >
          <Link2 className="h-4 w-4" />
          External URL
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
          {error}
        </div>
      )}

      <Input
        label="Material Title"
        placeholder="e.g. Week 4 Lecture Slides"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />

      <Textarea
        label="Description"
        rows={3}
        placeholder="Summarize what students should learn from this resource..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      {materialType === 'file' ? (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[#1E1B4B]">Select File</label>
          <input
            type="file"
            onChange={handleFileChange}
            className="block w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs text-[#1E1B4B] file:mr-3 file:rounded-lg file:border-0 file:bg-[#EDE9FE] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#7C5CFC]"
          />
          <p className="mt-1 text-[11px] text-[#6B7280]">
            Accepted: PPT, PPTX, PDF, DOC, DOCX, XLS, XLSX, JPEG, PNG, GIF, WebP, MP4, MOV, MP3, WAV, AAC, OGG, FLAC (max 500 MB).
          </p>
          {file && (
            <p className="mt-1 text-xs font-medium text-emerald-700">
              Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
        </div>
      ) : (
        <Input
          label="External Link URL"
          type="url"
          placeholder="https://example.edu/resource"
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          helperText="Must begin with http:// or https:// and conform to RFC 3986."
        />
      )}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" isLoading={submitting}>
          Save Material
        </Button>
      </div>
    </form>
  );
}
