
import { useState, useEffect } from 'react';
import mqtt from 'mqtt'; 

const useMqttFleetUpdates = () => {
  const [latestTruckUpdate, setLatestTruckUpdate] = useState(null);

  useEffect(() => {

    const client = mqtt.connect('ws://localhost:9001');

    client.on('connect', () => {
      console.log('MQTT: Connected to broker via WebSockets');
      client.subscribe('fleet/+/data', (err) => {
        if (!err) {
          console.log('MQTT: Subscribed to fleet/+/data');
        } else {
          console.error('MQTT: Subscription error:', err);
        }
      });
    });

    client.on('message', (topic, message) => {

      try {
        const updatedTruck = JSON.parse(message.toString());
        
        setLatestTruckUpdate(updatedTruck); 
      } catch (parseError) {
        console.error('MQTT: Error parsing message:', parseError);
      }
    });

    client.on('error', (err) => {
      console.error('MQTT: Client error:', err);

    });

    client.on('close', () => {
      console.log('MQTT: Connection closed.');
    });

    client.on('offline', () => {
      console.log('MQTT: Client went offline.');
    });
    return () => {
      if (client.connected) {
        console.log('MQTT: Disconnecting client.');
        client.end();
      }
    };
  }, []);

  return latestTruckUpdate; 
};

export default useMqttFleetUpdates;
