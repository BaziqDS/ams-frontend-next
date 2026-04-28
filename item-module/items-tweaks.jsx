/* ============================================================
   NED AMS — Items module Tweaks panel
   ============================================================ */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "layout": "split",
  "density": "balanced",
  "showRibbon": true
}/*EDITMODE-END*/;

function ItemsTweaks() {
  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => {
    const shell = document.getElementById('items-shell');
    if (shell) {
      shell.dataset.layout = tweaks.layout;
      shell.dataset.density = tweaks.density;
    }
  }, [tweaks.layout, tweaks.density]);

  React.useEffect(() => {
    const note = document.getElementById('design-note');
    if (note) note.style.display = tweaks.showRibbon ? '' : 'none';
    document.body.style.paddingTop = tweaks.showRibbon ? '31px' : '0';
  }, [tweaks.showRibbon]);

  return (
    <window.TweaksPanel title="Tweaks">
      <window.TweakSection label="Layout" />
      <window.TweakRadio
        label="Detail layout"
        value={tweaks.layout}
        options={[
          { value: 'split', label: 'Split' },
          { value: 'full', label: 'Full' },
        ]}
        onChange={(v) => setTweak('layout', v)}
      />
      <window.TweakRadio
        label="List density"
        value={tweaks.density}
        options={[
          { value: 'compact', label: 'Compact' },
          { value: 'balanced', label: 'Balanced' },
          { value: 'comfortable', label: 'Comfy' },
        ]}
        onChange={(v) => setTweak('density', v)}
      />
      <window.TweakSection label="Demo" />
      <window.TweakToggle
        label="Redesign ribbon"
        value={tweaks.showRibbon}
        onChange={(v) => setTweak('showRibbon', v)}
      />
      <window.TweakButton
        label="Cycle ITM-0142 → 0271 → 0508"
        onClick={() => {
          const ids = ['ITM-0142', 'ITM-0271', 'ITM-0508'];
          const cur = window.__items.state.selectedId;
          const idx = ids.indexOf(cur);
          const next = ids[(idx + 1) % ids.length];
          window.__items.selectItem(next);
        }}
      />
      <window.TweakButton
        label="Open Locate (⌘K)"
        onClick={() => window.__items.openLocate()}
      />
    </window.TweaksPanel>
  );
}

const root = ReactDOM.createRoot(document.getElementById('tweaks-root'));
root.render(<ItemsTweaks />);
