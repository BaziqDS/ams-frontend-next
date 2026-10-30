import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useObjectUrl } from './useObjectUrl';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
afterEach(() => vi.restoreAllMocks());

it('releases replaced and unmounted previews while displaying the current file', async () => {
  const create = vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
  const revoke = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true });
  const host = document.createElement('div');
  const root = createRoot(host);
  function Preview({ file }: { file: File | null }) { return <span>{useObjectUrl(file)}</span>; }
  await act(async () => root.render(<Preview file={new File(['a'], 'a.png')} />));
  expect(host.textContent).toBe('blob:first');
  await act(async () => root.render(<Preview file={new File(['b'], 'b.png')} />));
  expect(revoke).toHaveBeenCalledWith('blob:first');
  expect(host.textContent).toBe('blob:second');
  await act(async () => root.unmount());
  expect(revoke).toHaveBeenCalledWith('blob:second');
});
