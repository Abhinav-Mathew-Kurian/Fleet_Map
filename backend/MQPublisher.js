const mqtt = require('mqtt');
const mongoose = require('mongoose');
const client = mqtt.connect('mqtt://localhost:1883');
const Fleet = require('./Fleet')

client.on('connect', () => {
    console.log("Connection with mqtt broker has been established")
})

const startSimulation = () => {
    setInterval(async () => {
        try {
            const vehicles = await Fleet.find();
            console.log(`Found ${vehicles.length} vehicles in fleets`);

            for (const vehicle of vehicles) {
                let newSoc;
                let newTemp;
                let statusChanged = false;

                if (vehicle.truck.chargingStatus === 'charging') {
                    newTemp = vehicle.truck.batteryTemperature_C + Math.random() * 0.5;
                    newSoc = vehicle.truck.batterySOC_percent + Math.random() * 1;


                    if (newSoc >= 100) {
                        newSoc = 100;
                        vehicle.truck.chargingStatus = 'idle';
                        statusChanged = true;
                    }
                } else if (vehicle.truck.chargingStatus === 'discharging') {
                    newTemp = Math.floor(Math.random() * (30 - 15 + 1)) + 15;
                    newSoc = vehicle.truck.batterySOC_percent - Math.random() * 0.02;


                    if (newSoc <= 0) {
                        newSoc = 0;
                        vehicle.truck.chargingStatus = 'idle';
                        statusChanged = true;
                    }
                } else {
                    newTemp = vehicle.truck.batteryTemperature_C;
                    newSoc = vehicle.truck.batterySOC_percent;
                }

                vehicle.truck.batterySOC_percent = parseFloat(newSoc.toFixed(2));
                vehicle.truck.batteryTemperature_C = parseFloat(newTemp.toFixed(2));
                await vehicle.save();

                const topic = `fleet/${vehicle._id}/data`;
                const message = JSON.stringify(vehicle);
                client.publish(topic, message);

                console.log(`🚗 Simulated + Published data for ${vehicle.truck.model},
                    Battery SoC: ${vehicle.truck.batterySOC_percent}%,
                    Battery Temp: ${vehicle.truck.batteryTemperature_C}°C,
                    Status: ${vehicle.truck.chargingStatus}${statusChanged ? ' (Auto-changed to idle)' : ''}`);
            }
        }
        catch (err) {
            console.error('Error publishing data', err);
        }
    }, 1000);
}

module.exports = { startSimulation }