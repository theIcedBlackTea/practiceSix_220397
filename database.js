import mongoose from "mongoose";

// Connect to MongoDB

mongoose.connect('mongodb+srv://theIcedBlackTea:Totaso.08@theicedblackcluster.acgff.mongodb.net/?retryWrites=true&w=majority&appName=theIcedBlackCluster')
.then(() => console.log("MongoDB Atlas Connecteeeeeeeeeeeeed" ))
.catch(err => console.log(err));

export default mongoose;