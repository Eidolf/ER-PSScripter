import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Home from './pages/Home';
import SnippetLibrary from './pages/SnippetLibrary';
import './App.css';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        <header className="bg-white dark:bg-gray-800 shadow sticky top-0 z-50">
          <div className="container mx-auto px-6 py-4 flex justify-between items-center">
            <Link to="/" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
              <img src="/logo.png" alt="ER-PSScripter Logo" className="h-10 w-10 object-contain" />
              <span className="text-xl font-bold text-gray-800 dark:text-white tracking-tight">ER-PSScripter</span>
            </Link>
            <nav className="flex gap-6">
              <Link to="/snippets" className="font-medium text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                Snippet Library
              </Link>
            </nav>
          </div>
        </header>

        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/snippets" element={<SnippetLibrary />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
