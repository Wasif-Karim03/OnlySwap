import React from 'react';
import { motion } from 'framer-motion';

const AnimatedBlob: React.FC = () => (
  <motion.div
    className="blob-bg"
    initial={{ scale: 1, x: '-20vw', y: '-10vh', rotate: 0 }}
    animate={{
      scale: [1, 1.15, 1],
      x: ['-20vw', '60vw', '-10vw'],
      y: ['-10vh', '40vh', '10vh'],
      rotate: [0, 30, -15, 0],
    }}
    transition={{
      duration: 18,
      repeat: Infinity,
      repeatType: 'mirror',
      ease: 'easeInOut',
    }}
    style={{
      width: '60vw',
      height: '60vw',
      minWidth: 320,
      minHeight: 320,
      maxWidth: 700,
      maxHeight: 700,
      background: 'radial-gradient(circle at 30% 30%, #60a5fa 60%, #818cf8 100%)',
      borderRadius: '50%',
      top: '-10vh',
      left: '-20vw',
      position: 'fixed',
      zIndex: -1,
      filter: 'blur(40px)',
      opacity: 0.3,
    }}
  />
);

export default AnimatedBlob; 