const express=require('express');
const http=require('http');
const path=require('path');
const {Server}=require('socket.io');
const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:'*'}});
app.use(express.static(__dirname));
io.on('connection',socket=>{
  socket.on('join-room',room=>{
    room=String(room||'').trim().slice(0,80);
    if(!room)return;
    const members=io.sockets.adapter.rooms.get(room);
    const count=members?members.size:0;
    if(count>=2){socket.emit('room-full');return;}
    socket.join(room); socket.data.room=room;
    socket.emit('joined',{initiator:count===0});
    socket.to(room).emit('peer-joined');
  });
  socket.on('signal',({room,data})=>{
    if(socket.data.room===room) socket.to(room).emit('signal',data);
  });
  socket.on('leave-room',()=>{
    const room=socket.data.room;
    if(room){socket.leave(room);socket.to(room).emit('peer-left');socket.data.room=null;}
  });
  socket.on('disconnect',()=>{if(socket.data.room)socket.to(socket.data.room).emit('peer-left');});
});
app.get('/health',(req,res)=>res.json({ok:true,service:'WorldCall'}));
const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`WorldCall running on ${PORT}`));