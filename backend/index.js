require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors')
const http = require('http');
const axios = require('axios');
const { startSimulation } = require('./MQPublisher')
const Facility =require('./Facility')
const Fleet=require('./Fleet')


const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors())
const server = http.createServer(app);


const PORT1 = process.env.PORT1
const url = process.env.MONGO_URL
connectDB = async () => {
    try {
        await mongoose.connect(url)
        console.log("Connection succesful with the mongoDB Atlas");
    }
    catch (err) {
        console.error("Error connecting the MongoDB", err)
    }

}

app.get('/',(req,res)=>{
    res.send(`Server running on PORT ${PORT1} , get '/' has been verified`)
})

app.get('/facility', async (req, res) => {
    try {
        const facility = await Facility.find()
        res.json(facility)
    }
    catch (err) {
        console.log("Error fetching Station", err)
    }
})
app.get('/fleet', async (req, res) => {
    try {
        const fleet = await Fleet.find()
        res.json(fleet)
    }
    catch (err) {
        console.log("Error fetching fleet", err)
    }
})

app.patch('/updateStatus', async (req, res) => {
    try {
        const user = await Fleet.findByIdAndUpdate(
            req.body.userId,
            { 'truck.chargingStatus': req.body.chargingStatus },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
    } catch (err) {
        console.error('Error in updating the status', err);
        res.status(500).json({ error: 'Failed to update status' });
    }
});


const startServer = async () => {
    try {
        await connectDB()
        await startSimulation()
        server.listen(PORT1, () => {
            console.log(`The backend has been running on server ${PORT1}`)
        })
    } catch (err) {
        console.error("Error Starting server:", err);
        process.exit(1)
    }
}
process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log("MONGO DB Connection closed");
    process.exit(0)
})


startServer();