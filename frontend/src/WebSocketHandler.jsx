import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const WebSocketHandler = ({ selectedTruck, onLocationUpdate, onNavigationComplete, onNavigationStopped }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!selectedTruck) return;


    const newSocket = io('http://localhost:5001', {
      transports: ['websocket'],
      timeout: 5000
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to WebSocket');
      setConnected(true);
      

      newSocket.emit('join-user', selectedTruck._id);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from WebSocket');
      setConnected(false);
    });

    newSocket.on('location-update', (data) => {
      console.log('Location update:', data);
      if (onLocationUpdate) {
        onLocationUpdate(data);
      }
    });


    newSocket.on('navigation-completed', (data) => {
      console.log('Navigation completed:', data);
      if (onNavigationComplete) {
        onNavigationComplete(data);
      }
    });


    newSocket.on('navigation-stopped', (data) => {
      console.log('Navigation stopped:', data);
      if (onNavigationStopped) {
        onNavigationStopped(data);
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setConnected(false);
    });

    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, [selectedTruck?._id]);


  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  return null; 
};

export default WebSocketHandler;