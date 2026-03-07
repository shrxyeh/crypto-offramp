export default function Loading() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#08080f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 48,
          height: 48,
          border: '3px solid rgba(45,212,191,0.15)',
          borderTop: '3px solid #2dd4bf',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 16px',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, fontFamily: 'system-ui' }}>
          Loading...
        </p>
      </div>
    </div>
  );
}
