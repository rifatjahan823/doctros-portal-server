const express = require('express');
const cors= require('cors');
const jwt = require('jsonwebtoken');
var nodemailer = require('nodemailer');
require('dotenv').config();
var sgTransport = require('nodemailer-sendgrid-transport');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const app = express();
const port = process.env.PORT || 5000;

//midleware
app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mpku2.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

 async function run(){
    try{
      await client.connect();
      const servicesCollection = client.db("doctros-portal").collection("services");
      const bookingCollection = client.db("doctros-portal").collection('bookings');
      const userCollection = client.db("doctros-portal").collection('users');
      const doctorsCollection = client.db("doctros-portal").collection('doctors');
      const paymentCollection = client.db("doctros-portal").collection('payment');

/******verify JWT********/
function verifyJWT(req,res,next){
  const authHeader =req.headers.authorization;
  if(!authHeader){
    return res.status(401).send({message:'authorization'})
  }
  const token =authHeader.split(' ')[1];
  // verify a token symmetric
jwt.verify(token,process.env.ACCESS_TOKEN_SECRET, function(err, decoded) {
  if(err){
    return res.status(403).send({message:'Forbiden access'})
  }
  req.decoded=decoded;
  next();
});
}
/******verifyAddmin ********/
const verifyAdmin=async(req,res,next)=>{
  const requerster = req.decoded.email;
  const requersterAccount = await userCollection.findOne({email:requerster});
  if(requersterAccount.role==='admin'){
next();
  }else{
    res.status(403).send({message:"you are nont admin"})
  }
}
/******Send email when user booking appoinment********/
const emailOptions = {
  auth: {
    api_key:process.env.EMAIL_SENDER_KEY
  }
}
const emailClient = nodemailer.createTransport(sgTransport(emailOptions));

function sendAppoinmentEmail(booking){
const{patientEmail,patientName,treatment,date,slot}=booking;
const email = {
  from: process.env.EMAIL_SENDER,
  to: patientEmail,
  subject: `Your Appoinment for ${treatment} is on ${date} at ${slot}`,
  text: `Your Appoinment for ${treatment} is on ${date} at ${slot}`,
  html: `
  <div>
  <h2>Hello ${patientName}</h2>
  <h3>Your appoinment ${treatment} is confirmed</h3>
  <p>Looking forward to Seeing You ${date} at ${slot}</p>
  <h3>Our Address:Dhaka</h3>
  <p>Bangladesh</p>
  <a href='https://web.programming-hero.com/'>Unsubscribe</a>
  </div>
  `
};
emailClient.sendMail(email, function(err, info){
  if (err ){
    console.log(err);
  }
  else {
    console.log('Message sent:',info);
  }
});
}

/******payment get way to send payment/CheckOutForm.js********/
app.post('/create-payment-intent', verifyJWT, async(req, res) =>{
  const service = req.body;
  console.log(service)
  const price = service.price;
  const amount = price*100;
  const paymentIntent = await stripe.paymentIntents.create({
    amount : amount,
    currency: 'usd',
    payment_method_types:['card']
  });
  res.send({clientSecret: paymentIntent.client_secret})
});



/******get all service********/
app.get('/services',async(req,res)=>{
  const query = {};
  const cursor =servicesCollection.find(query).project({name:1});
  const services = await cursor.toArray();
  res.send(services)
})

/******get add doctor-information from page dashbord/adddoctor information sent backend********/
app.post('/doctor',verifyJWT,verifyAdmin,async(req,res)=>{
  const doctor = req.body;
  const result = await doctorsCollection.insertOne(doctor);
  return res.send(result);
})

app.get('/doctor',verifyJWT,async(req,res)=>{
  const doctor = await doctorsCollection.find().toArray();
  res.send(doctor)
})
app.delete('/doctor/:email',verifyJWT,verifyAdmin,async(req,res)=>{
  const email = req.params.email;
  const query = {email:email}
  const result = await doctorsCollection.deleteOne(query);
  return res.send(result);
})


 /**
     * API Naming Convention
     * app.get('/booking') // get all bookings in this collection. or get more than one or by filter
     * app.get('/booking/:id') // get a specific booking 
     * app.post('/booking') // add a new booking
     * app.patch('/booking/:id) //
     * app.put('/booking/:id) //update user
     * app.delete('/booking/:id) //
    */

/******update user********/

app.put('/user/:email',async(req,res)=>{
  const email = req.params.email;
  const user = req.body;
  const filter = {email:email};
  const options = {upsert:true};
  const updateDoc = {
    $set:user,
  };
  const result = await userCollection.updateOne(filter, updateDoc, options);
   const token=jwt.sign({email:email},process.env.ACCESS_TOKEN_SECRET);
  res.send({result,token:token});
})
//ADMIN ROLL
app.put('/user/admin/:email',verifyJWT,verifyAdmin,async(req,res)=>{
  const email = req.params.email;
    const filter = {email:email};
    const updateDoc = {
      $set:{role:"admin"},
    };
    const result = await userCollection.updateOne(filter, updateDoc);
    res.send(result);
 
})
app.get('/admin/:email',async(req,res)=>{
  const email = req.params.email;
  const user = await userCollection.findOne({email:email});
  const isAdmin =user.role==='admin';
  res.send({admin:isAdmin})
})
/******get all user********/
app.get('/user',verifyJWT,async(req,res)=>{
  const user= await userCollection.find().toArray();
  res.send(user)
})

/******get user booking information sent backend********/
app.post('/booking',async(req,res)=>{
  const booking = req.body;
  //for one time per catagory per day
  const query = {treatment:booking.treatment,date:booking.date,patientEmail:booking.patientEmail};
  const findOne =await bookingCollection.findOne(query);
  if(findOne){
    return res.send({success:false,booking:findOne});
  }
  const result = await bookingCollection.insertOne(booking);
  sendAppoinmentEmail(booking)
  return res.send({success:true,result});
})
// -------get all apppoinment---------
app.get('/allbooking',async(req,res)=>{
  const allbooking= await bookingCollection.find().toArray();
  res.send(allbooking)
})
/******show per user appoinment by email********/
app.get('/booking',verifyJWT,async(req,res)=>{
  const patientEmail = req.query.patientEmail;
  const decodedEmail = req.decoded.email;
  if(patientEmail===decodedEmail){
    const query ={patientEmail:patientEmail};
    const booking =await bookingCollection.find(query).toArray();
    return res.send(booking)
  }else{
    return res.status(403).send({message:'forbiden'})
  }
})

/******booking detauls by id per user********/
app.get('/booking/:id',verifyJWT,async(req,res)=>{
  const id= req.params.id;
  const query={_id:ObjectId(id)};
  const booking = await bookingCollection.findOne(query);
  res.send(booking)
})

/******store payment********/
app.patch('/booking/:id',verifyJWT,async(req,res)=>{
  const id= req.params.id;
  const payment = req.body;
  const query={_id:ObjectId(id)};
  const updatedDoc = {
    $set:{
      paid:true,
      transactionId:payment.transactionId,
    }
  } 
  const updatedBooking = await bookingCollection.updateOne(query,updatedDoc);
  const result = await paymentCollection.insertOne(payment );
  res.send(updatedDoc)
})


/******Send email when user payment********/
function sendPaymentEmail(booking){
const{patientEmail,patientName,treatment,date,slot}=booking;
const email = {
  from: process.env.EMAIL_SENDER,
  to: patientEmail,
  subject: `Your have receved your payment for ${treatment} is on ${date} at ${slot}`,
  text: `Your Payment for ${treatment} is on ${date} at ${slot}`,
  html: `
  <div>
  <h2>Hello ${patientName}</h2>
  <h3>Your appoinment ${treatment} is confirmed</h3>
  <p>Looking forward to Seeing You ${date} at ${slot}</p>
  <h3>Our Address:Dhaka</h3>
  <p>Bangladesh</p>
  <a href='https://web.programming-hero.com/'>Unsubscribe</a>
  </div>
  `
};
emailClient.sendMail(email, function(err, info){
  if (err ){
    console.log(err);
  }
  else {
    console.log('Message sent:',info);
  }
});
}



/******remove available time if user booking it ********/
app.get('/available',async(req,res)=>{
  const date = req.query.date;
  //1.setp-1 get all services
  const services =await servicesCollection.find().toArray();
  //2.step-2 get booking date
  const query={date:date};
  const bookings = await bookingCollection.find(query).toArray();
  //3.setp-3 for each get all service and find bookings for that service
  services.forEach(service=>{
    serviceBookings = bookings.filter(b=>b.treatment===service.name);
    const booked = serviceBookings.map(b=>b.slot);
    const available=service.slots.filter(s=>!booked.includes(s) );
    service.slots= available;
  })
  res.send(services)
})

    }
    finally{

    }
}
run().catch(console.dir);



// GET method route
app.get('/', (req, res) => {
    res.send('GET request to the homepage')
  })
  

  app.listen(port, () => {
    console.log('POST request to the homepage')
  })