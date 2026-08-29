import {
  pick,
  types,
  keepLocalCopy,
  isErrorWithCode,
  errorCodes,
} from '@react-native-documents/picker';
import BlobUtil from 'react-native-blob-util';
import { api, mediaUrl, requestId, sessionGeneration } from '../services/api';

export async function uploadMedia() {
  const epoch = sessionGeneration();
  let localPath: string | undefined;
  try {
    const [file] = await pick({
      type: [types.images, types.video],
      allowMultiSelection: false,
    });
    const mimeType = file.type || '';
    if (
      !['image/png', 'image/jpeg', 'image/webp', 'video/mp4'].includes(mimeType)
    ) {
      throw new Error('اختر صورة PNG / JPEG / WebP أو فيديو MP4.');
    }
    const kind = mimeType.startsWith('image/') ? 'image' : 'video';
    const extension =
      mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
    const [copy] = await keepLocalCopy({
      destination: 'cachesDirectory',
      files: [
        { uri: file.uri, fileName: `csc-upload-${requestId()}.${extension}` },
      ],
    });
    if (copy.status !== 'success') {
      throw new Error('تعذر قراءة الملف المختار.');
    }
    localPath = decodeURIComponent(copy.localUri.replace(/^file:\/\//, ''));
    const byteSize = Number((await BlobUtil.fs.stat(localPath)).size);
    if (
      !Number.isFinite(byteSize) ||
      byteSize <= 0 ||
      byteSize > (kind === 'image' ? 5 : 100) * 1024 * 1024
    ) {
      throw new Error('الحد الأقصى: صورة 5MB أو فيديو 100MB.');
    }
    const checksumSha256 = await BlobUtil.fs.hash(localPath, 'sha256');
    if (epoch !== sessionGeneration()) {
      throw new Error('انتهت الجلسة.');
    }
    const grant = await api<{
      assetId: string;
      uploadUrl: string;
      headers: Record<string, string>;
    }>('/admin/assets/upload-sessions', 'POST', {
      kind,
      mimeType,
      byteSize,
      checksumSha256,
    });
    const response = await BlobUtil.config({ timeout: 120000 }).fetch(
      'PUT',
      mediaUrl(grant.uploadUrl),
      grant.headers,
      BlobUtil.wrap(localPath),
    );
    if (response.info().status < 200 || response.info().status >= 300) {
      throw new Error('فشل رفع الملف. حاول مجددًا.');
    }
    if (epoch !== sessionGeneration()) {
      throw new Error('انتهت الجلسة.');
    }
    await api(`/admin/assets/${grant.assetId}/complete`, 'POST');
    return true;
  } catch (error) {
    if (
      isErrorWithCode(error) &&
      error.code === errorCodes.OPERATION_CANCELED
    ) {
      return false;
    }
    throw error;
  } finally {
    // Only delete the unique app-owned copy, never the selected original file.
    if (
      localPath &&
      /\/csc-upload-[a-f0-9-]+\.(jpg|png|webp|mp4)$/.test(localPath)
    ) {
      await BlobUtil.fs.unlink(localPath).catch(() => {});
    }
  }
}
