export default function WorkspaceLoading() {
  const bar = (width, height = 12, radius = 6) => ({
    width,
    height,
    borderRadius: radius,
    background: '#EEF1F6',
  });

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading workspace page"
      style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1040 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={bar(120, 11)} />
        <div style={bar(280, 26, 8)} />
        <div style={bar(420, 12)} />
      </div>
      <div
        style={{
          height: 180,
          borderRadius: 18,
          border: '1px solid #E5EAF1',
          background: '#F8FAFC',
        }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            style={{
              height: 108,
              borderRadius: 14,
              border: '1px solid #E5EAF1',
              background: '#FFFFFF',
            }}
          />
        ))}
      </div>
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
        }}
      >
        Loading workspace content…
      </span>
    </div>
  );
}
