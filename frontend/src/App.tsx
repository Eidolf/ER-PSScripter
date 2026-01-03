import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import SnippetLibrary from './pages/SnippetLibrary';
import './App.css';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        <header className="bg-white dark:bg-gray-800 shadow">
          <div className="container mx-auto px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <img src="/logo.png" alt="Logo" className="h-8 w-8" />
              <span className="text-xl font-bold text-gray-800 dark:text-white">ER-PSScripter</span>
            </div>
            <nav className="flex gap-6">
              <Link to="/" className="text-gray-600 dark:text-gray-300 hover:text-blue-500">Generator</Link>
              <Link to="/snippets" className="text-gray-600 dark:text-gray-300 hover:text-blue-500">Snippet Library</Link>
            </nav>
          </div>
        </header>

        <main>
          <Routes>
            <Route path="/" element={<div className="p-10 text-center dark:text-white">Generator Placeholder</div>} />
            <Route path="/snippets" element={<SnippetLibrary />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
