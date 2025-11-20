import mongoose from "mongoose";

const databaseConnection = () => {
    mongoose.connect('mongodb://127.0.0.1:27017/mydatabase').then(()=>{
        console.log("Connected to mongoDB");
    }).catch((error)=>{
        console.log(error);
    })
}
export default databaseConnection;