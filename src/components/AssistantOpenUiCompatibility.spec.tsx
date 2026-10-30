import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Renderer } from '@openuidev/react-lang';
import { openuiChatLibrary, ThemeProvider } from '@openuidev/react-ui';

it('renders an assistant response with the actual upgraded OpenUI packages', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const errors: unknown[] = [];
  try {
    await act(async () => root.render(
      <ThemeProvider mode="light">
        <Renderer library={openuiChatLibrary} response={'root = TextContent("Inventory ready")'} isStreaming={false} onError={value => errors.push(...value)} />
      </ThemeProvider>,
    ));
    expect(errors).toEqual([]);
    expect(host.textContent).toContain('Inventory ready');
    expect(host.textContent).not.toContain('root =');
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
