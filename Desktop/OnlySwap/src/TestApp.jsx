import React from 'react';

function TestApp() {
  return (
    <div style={{ 
      padding: '2rem', 
      backgroundColor: '#4CAF50', 
      color: 'white', 
      minHeight: '100vh',
      textAlign: 'center'
    }}>
      <h1>OnlySwap Test Page</h1>
      <p>If you can see this, React is working!</p>
      <p>Current time: {new Date().toLocaleString()}</p>
    </div>
  );
}

export default TestApp;
