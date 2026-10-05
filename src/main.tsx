import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './style.css';
class ErrorBoundary extends React.Component<{children:React.ReactNode},{error:boolean}>{state={error:false};static getDerivedStateFromError(){return{error:true}}render(){return this.state.error?<main className="fatal"><img src="./favicon.svg" alt="Arya" width="72"/><h1>Biraz pati dolaştı.</h1><p>Sayfa açılırken bir sorun oldu. Kayıtlarını silmeden yeniden deneyebilirsin.</p><button onClick={()=>location.reload()}>Sayfayı yenile</button></main>:this.props.children}}
createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App/></ErrorBoundary></React.StrictMode>);
