import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
 
// basicSsl enables HTTPS on the dev server so that navigator.mediaDevices
// (which requires a secure context) works when the app is opened from
// another machine on the same LAN via https://192.168.x.x:5173
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,   // expose on all network interfaces (0.0.0.0)
    port: 5173,
    https: true   // enable TLS with the auto-generated self-signed cert
  }
})