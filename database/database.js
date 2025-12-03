import mongoose from "mongoose";

// mongodb://127.0.0.1:27017/mydatabase - local database url
// mongodb+srv://manish_db_user:ManishOP@cluster0.fhw6wrg.mongodb.net/myDatabase

const databaseConnection = () => {
    mongoose.connect('mongodb+srv://manish_db_user:ManishOP@cluster0.fhw6wrg.mongodb.net/myDatabase').then(()=>{
        console.log("Connected to mongoDB");
    }).catch((error)=>{
        console.log(error);
    })
}
export default databaseConnection;