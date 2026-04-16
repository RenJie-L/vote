import { Routes, Route, NavLink } from 'react-router-dom'
import { PollListPage } from './pages/PollListPage'
import { CreatePollPage } from './pages/CreatePollPage'
import { PollDetailPage } from './pages/PollDetailPage'

export function App() {
  return (
    <div className="app">
      <header className="header">
        <NavLink to="/" className="brand" end>
          简易投票
        </NavLink>
        <nav className="nav">
          <NavLink to="/" end>
            全部议题
          </NavLink>
          <NavLink to="/new">新建投票</NavLink>
        </nav>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<PollListPage />} />
          <Route path="/new" element={<CreatePollPage />} />
          <Route path="/poll/:id" element={<PollDetailPage />} />
        </Routes>
      </main>
    </div>
  )
}
