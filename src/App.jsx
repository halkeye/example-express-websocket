import { useEffect, useReducer } from 'react'
import './App.css'

const initialState = {chunks: []};

function reducer(state, action) {
  switch (action.type) {
    case 'add_chunk':
      return {...state, chunks: [...state.chunks, action.value ]}
    default:
      throw new Error();
  }
}

async function fetchData(dispatch) {
  const url = new URL('/websockets', window.location.href);
  url.protocol = url.protocol.replace('http', 'ws');
  const socket = new WebSocket(url.href);

  // Connection opened
  socket.addEventListener('open', function (_event) {
    socket.send('Hello Server!');
  });

  // Listen for messages
  socket.addEventListener('message', function (event) {
    console.log('Message from server ', event.data);
    dispatch({ type: 'add_chunk', value: event.data })
  })
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => fetchData(dispatch), []);

  return (
    <div className="App">
      <header className="App-header">
        <p>Hello Vite + React!</p>
        <h3>Chunks</h3>
        <ul>
          {state.chunks.map((chunk, idx) =>  <li key={idx}>{chunk}</li>)}
        </ul>
      </header>
    </div>
  )
}

export default App

