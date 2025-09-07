import React from 'react';

function MinimalTest() {
  return (
    <div style={{ 
      padding: '2rem',
      backgroundColor: '#4CAF50',
      color: 'white',
      minHeight: '100vh',
      textAlign: 'center'
    }}>
      <h1>OnlySwap Test</h1>
      <p>If you see this, React is working!</p>
      <p>Time: {new Date().toLocaleString()}</p>
    </div>
  );
}

export default MinimalTest;
