import mongoose from "mongoose";

const databaseConnection = () => {
    mongoose.connect('mongodb+srv://manish_db_user:TDW3LlgEoD5kTTUZ@cluster0.fhw6wrg.mongodb.net/myDatabase?appName=Cluster0').then(()=>{
        console.log("Connected to mongoDB");
    }).catch((error)=>{
        console.log(error);
    })
}
export default databaseConnection;