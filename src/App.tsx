import { useState, useEffect, createContext, useContext } from 'react';
import { Routes, Route, Navigate, Link, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  PenTool, 
  LogOut, 
  LogIn, 
  UserPlus, 
  ChevronRight, 
  Sparkles, 
  BookOpen,
  Loader2,
  ArrowLeft,
  Edit,
  Trash2,
  Users,
  ShieldCheck,
  FileText
} from 'lucide-react';
import axios from 'axios';
import Markdown from 'react-markdown';
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

// --- Types ---
interface User {
  id: string;
  username: string;
  role: 'user' | 'admin';
}

interface Blog {
  id: string;
  user_id: string | null;
  title: string;
  excerpt: string;
  content: string;
  tone: string;
  language: string;
  created_at: string;
}

// --- Auth Context ---
const AuthContext = createContext<{
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
} | null>(null);

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

// --- Components ---
const Navbar = () => {
  const { user, logout } = useAuth();
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5 px-6 py-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link to="/" className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="text-purple-500" />
          <span className="gradient-text">ZA Blog AI</span>
        </Link>
        <div className="flex items-center gap-6">
          {user?.role === 'admin' && (
            <Link to="/admin" className="text-zinc-400 hover:text-white transition-colors flex items-center gap-2">
              <ShieldCheck size={18} className="text-emerald-500" />
              Admin
            </Link>
          )}
          <Link to="/dashboard" className="text-zinc-400 hover:text-white transition-colors flex items-center gap-2">
            <LayoutDashboard size={18} />
            Dashboard
          </Link>
          <Link to="/write" className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all">
            <PenTool size={18} />
            Write Blog
          </Link>
          {user ? (
            <>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-purple-500 to-emerald-500 flex items-center justify-center text-[10px] font-bold">
                  {user.username.substring(0, 2).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-zinc-300">{user.username}</span>
              </div>
              <button 
                onClick={() => {
                  if (window.confirm('Bạn có chắc chắn muốn đăng xuất không?')) {
                    logout();
                  }
                }} 
                className="text-zinc-400 hover:text-red-400 transition-colors flex items-center gap-2"
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-zinc-400 hover:text-white transition-colors">Login</Link>
              <Link to="/register" className="bg-white text-black px-4 py-2 rounded-lg font-medium hover:bg-zinc-200 transition-all">Get Started</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
};

// --- Pages ---
const Home = () => (
  <div className="pt-32 pb-20 px-6">
    <div className="max-w-4xl mx-auto text-center">
      <motion.h1 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-6xl md:text-8xl font-bold mb-8 tracking-tight"
      >
        Write Better Blogs <br />
        <span className="gradient-text">With ZA Blog AI</span>
      </motion.h1>
      <motion.p 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-xl text-zinc-400 mb-12 max-w-2xl mx-auto"
      >
        The ultimate AI-powered blogging platform. Generate high-quality, SEO-optimized content in seconds.
      </motion.p>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex justify-center gap-4"
      >
        <Link to="/write" className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 rounded-xl text-lg font-semibold flex items-center gap-2">
          Try Now <Sparkles size={20} />
        </Link>
        <Link to="/register" className="bg-white/10 hover:bg-white/20 text-white px-8 py-4 rounded-xl text-lg font-semibold flex items-center gap-2 transition-all">
          Create Account <ChevronRight />
        </Link>
      </motion.div>
    </div>
  </div>
);

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user, navigate]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) return;
      
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        login(event.data.token, event.data.user);
        navigate('/dashboard');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [login, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await axios.post('/api/auth/login', { username, password });
      login(res.data.token, res.data.user);
      navigate('/dashboard');
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError(err.response.data.error || 'Tên đăng nhập hoặc mật khẩu không chính xác.');
      } else {
        setError('Đã có lỗi xảy ra. Vui lòng thử lại sau.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const res = await axios.get('/api/auth/google/url');
      window.open(res.data.url, 'google_login', 'width=600,height=700');
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Không thể kết nối với Google.';
      setError(msg);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass p-8 rounded-2xl w-full max-w-md"
      >
        <h2 className="text-3xl font-bold mb-6 text-center">Welcome Back</h2>
        
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center"
          >
            {error}
          </motion.div>
        )}

        <div className="space-y-4 mb-8">
          <button 
            onClick={handleGoogleLogin}
            className="w-full bg-white text-zinc-900 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-3 hover:bg-zinc-100"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-zinc-950 px-2 text-zinc-500">Or continue with username</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Username</label>
            <input 
              type="text" 
              className="w-full bg-zinc-900 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Password</label>
            <input 
              type="password" 
              className="w-full bg-zinc-900 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Sign In'}
          </button>
        </form>
        <p className="mt-6 text-center text-zinc-400">
          Don't have an account? <Link to="/register" className="text-purple-400 hover:underline">Register</Link>
        </p>
      </motion.div>
    </div>
  );
};

const Register = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await axios.post('/api/auth/register', { username, password });
      navigate('/login');
    } catch (err: any) {
      if (err.response?.status === 400) {
        setError(err.response.data.error || 'Đăng ký thất bại.');
      } else {
        setError('Đăng ký thất bại. Vui lòng thử lại.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass p-8 rounded-2xl w-full max-w-md"
      >
        <h2 className="text-3xl font-bold mb-6 text-center">Create Account</h2>

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center"
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Username</label>
            <input 
              type="text" 
              className="w-full bg-zinc-900 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Password</label>
            <input 
              type="password" 
              className="w-full bg-zinc-900 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Register'}
          </button>
        </form>
        <p className="mt-6 text-center text-zinc-400">
          Already have an account? <Link to="/login" className="text-emerald-400 hover:underline">Login</Link>
        </p>
      </motion.div>
    </div>
  );
};

const AdminPanel = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [userCount, setUserCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/dashboard');
      return;
    }

    const fetchData = async () => {
      try {
        const res = await axios.get('/api/admin/stats', { 
          headers: { Authorization: `Bearer ${token}` } 
        });
        setUserCount(res.data.userCount);
      } catch (err) {
        console.error('Admin stats error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [token, user, navigate]);

  if (!user || user.role !== 'admin') return null;
  if (isLoading) return <div className="pt-40 text-center"><Loader2 className="animate-spin mx-auto" /></div>;

  return (
    <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-12">
        <ShieldCheck className="text-emerald-500" size={32} />
        <h1 className="text-4xl font-bold">Admin Panel</h1>
      </div>

      <div className="glass p-12 rounded-3xl text-center">
        <Users size={64} className="text-purple-500 mx-auto mb-6" />
        <h2 className="text-2xl font-semibold text-zinc-400 mb-2">Total Registered Users</h2>
        <div className="text-7xl font-bold gradient-text">{userCount}</div>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [health, setHealth] = useState<any>(null);
  const { user, token } = useAuth();

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await axios.get('/api/health');
        setHealth(res.data);
      } catch (err) {
        console.error('Health check failed');
      }
    };
    checkHealth();

    const fetchBlogs = async () => {
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await axios.get('/api/blogs', { headers });
        setBlogs(res.data);
      } catch (err) {
        console.error('Fetch blogs failed', err);
      }
    };
    fetchBlogs();
  }, [token]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa bài viết này không?')) return;
    try {
      await axios.delete(`/api/blogs/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBlogs(blogs.filter(b => b.id !== id));
    } catch (err) {
      alert('Lỗi khi xóa bài viết');
    }
  };

  return (
    <div className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
      {health?.firebase === 'missing_credentials' && (
        <div className="mb-8 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
          <strong>Lưu ý:</strong> Firebase chưa được cấu hình. Bạn vẫn có thể tạo bài viết nhưng chúng sẽ không được lưu lại. 
          Vui lòng thiết lập FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL và FIREBASE_PRIVATE_KEY trong Secrets.
        </div>
      )}
      <div className="flex justify-between items-center mb-12">
        <h1 className="text-4xl font-bold">
          {user ? 'My Blogs' : 'Public Blogs'}
        </h1>
        <Link to="/write" className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2">
          <PenTool size={20} /> New Blog
        </Link>
      </div>

      {blogs.length === 0 ? (
        <div className="text-center py-20 glass rounded-3xl">
          <BookOpen className="mx-auto text-zinc-600 mb-4" size={48} />
          <p className="text-zinc-400 text-lg">No blogs yet. Start writing your first one!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {blogs.map((blog) => (
            <motion.div 
              key={blog.id}
              whileHover={{ y: -5 }}
              className="glass p-6 rounded-2xl flex flex-col"
            >
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-xl font-bold line-clamp-2">{blog.title}</h3>
                {user && (blog.user_id === user.id || user.role === 'admin') && (
                  <div className="flex gap-2">
                    <Link to={`/edit/${blog.id}`} className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors">
                      <Edit size={16} />
                    </Link>
                    <button 
                      onClick={() => handleDelete(blog.id)}
                      className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-zinc-400 text-sm mb-6 line-clamp-3 flex-grow">{blog.excerpt}</p>
              <div className="flex justify-between items-center mt-auto">
                <span className="text-xs text-zinc-500">{new Date(blog.created_at).toLocaleDateString()}</span>
                <Link to={`/blog/${blog.id}`} className="text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1">
                  Read More <ChevronRight size={16} />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

const WriteBlog = () => {
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('professional');
  const [language, setLanguage] = useState('Tiếng Việt');
  const [length, setLength] = useState('standard'); // short, standard, long
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedBlog, setGeneratedBlog] = useState<any>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const { token } = useAuth();
  const navigate = useNavigate();

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);

    const lengthMap: Record<string, string> = {
      short: 'Short: 300-500 words.',
      standard: 'Standard: 800-1,200 words.',
      long: 'In-depth: 1,500+ words.'
    };

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('MISSING_API_KEY');
      }

      const ai = new GoogleGenAI({ apiKey });
      let response;
      try {
        response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Chủ đề: "${topic}"
Ngôn ngữ: ${language}
Phong cách: ${tone}
Độ dài yêu cầu: ${lengthMap[length]}`,
          config: {
            systemInstruction: `Bạn là một chuyên gia viết blog chuyên nghiệp, có khả năng viết lách xuất sắc.
Nhiệm vụ: Viết một bài blog chi tiết, giàu giá trị, định dạng Markdown đẹp mắt (H1, H2, H3, lists).
Yêu cầu quan trọng:
- Tuyệt đối không sai lỗi chính tả tiếng Việt.
- Sử dụng bảng mã UTF-8 chuẩn, không dùng các ký tự lạ gây lỗi font.
- Văn phong trôi chảy, chuyên nghiệp, lôi cuốn.
- Đảm bảo độ dài bài viết phù hợp với yêu cầu: ${lengthMap[length]}.
- Nếu yêu cầu là "In-depth" (Chuyên sâu), hãy viết cực kỳ chi tiết, phân tích đa chiều, có ví dụ cụ thể.`,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            maxOutputTokens: 12000,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "Tiêu đề bài viết hấp dẫn" },
                excerpt: { type: Type.STRING, description: "Tóm tắt ngắn gọn 2 câu" },
                content: { type: Type.STRING, description: "Nội dung bài viết định dạng Markdown" }
              },
              required: ["title", "excerpt", "content"]
            }
          }
        });
      } catch (aiErr: any) {
        console.error('AI API Error:', aiErr);
        const detail = aiErr.message || 'Unknown AI error';
        throw new Error(`AI_GENERATION_FAILED|${detail}`);
      }

      let text = response.text || '';
      if (!text) throw new Error('AI_EMPTY_RESPONSE');

      // Clean up potential markdown code blocks
      text = text.replace(/```json\n?/, '').replace(/\n?```/, '').trim();
      
      let result;
      try {
        result = JSON.parse(text);
      } catch (parseErr) {
        console.error('JSON Parse Error:', parseErr, 'Raw text:', text);
        throw new Error('INVALID_JSON_FORMAT');
      }
      
      if (!result.title || !result.content) {
        throw new Error('INCOMPLETE_DATA');
      }
      
      // Save to database
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const dbRes = await axios.post('/api/blogs', {
          ...result,
          tone,
          language
        }, { headers });
        setGeneratedBlog(dbRes.data);
      } catch (dbErr: any) {
        console.error('Database Error:', dbErr);
        const serverMsg = dbErr.response?.data?.details || dbErr.message;
        throw new Error(`DATABASE_SAVE_FAILED|${serverMsg}`);
      }
    } catch (err: any) {
      console.error('Full Error Object:', err);
      let errorMsg = '';
      const [errCode, errDetail] = err.message.split('|');
      
      switch (errCode) {
        case 'MISSING_API_KEY':
          errorMsg = 'Thiếu GEMINI_API_KEY. Vui lòng kiểm tra file .env và khởi động lại server.';
          break;
        case 'AI_GENERATION_FAILED':
          errorMsg = `AI không thể tạo nội dung: ${errDetail || 'Lỗi kết nối hoặc hết hạn ngạch'}.`;
          break;
        case 'DATABASE_SAVE_FAILED':
          errorMsg = `Lỗi lưu dữ liệu: ${errDetail || 'Không thể kết nối tới Firebase'}. Hãy đảm bảo bạn đã cấu hình FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL và FIREBASE_PRIVATE_KEY trong file .env.`;
          break;
        case 'AI_EMPTY_RESPONSE':
          errorMsg = 'AI trả về kết quả rỗng. Vui lòng thử lại.';
          break;
        case 'INVALID_JSON_FORMAT':
          errorMsg = 'Lỗi định dạng dữ liệu từ AI. Vui lòng thử lại với chủ đề khác.';
          break;
        default:
          errorMsg = 'Đã có lỗi xảy ra: ' + (err.message || 'Unknown error');
      }
      alert(errorMsg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadWord = async () => {
    if (!generatedBlog) return;

    setIsDownloading(true);
    try {
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              text: generatedBlog.title,
              heading: HeadingLevel.HEADING_1,
              spacing: { after: 400 },
            }),
            ...generatedBlog.content.split('\n').map((line: string) => {
              const trimmed = line.trim();
              if (trimmed.startsWith('### ')) {
                return new Paragraph({ text: trimmed.replace('### ', ''), heading: HeadingLevel.HEADING_3, spacing: { before: 240, after: 120 } });
              } else if (trimmed.startsWith('## ')) {
                return new Paragraph({ text: trimmed.replace('## ', ''), heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } });
              } else if (trimmed.startsWith('# ')) {
                return new Paragraph({ text: trimmed.replace('# ', ''), heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } });
              } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return new Paragraph({ text: trimmed.substring(2), bullet: { level: 0 }, spacing: { after: 120 } });
              } else if (trimmed === '') {
                return new Paragraph({ text: '', spacing: { after: 120 } });
              } else {
                return new Paragraph({
                  children: [new TextRun(trimmed)],
                  spacing: { after: 200 },
                });
              }
            }),
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${generatedBlog.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.docx`);
    } catch (err: any) {
      console.error('Word Download error:', err);
      alert('Không thể tải xuống bản Word. Vui lòng thử lại.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (generatedBlog) {
    return (
      <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass p-8 md:p-12 rounded-3xl"
        >
          <div className="flex justify-between items-center mb-8">
            <button 
              onClick={() => setGeneratedBlog(null)}
              className="text-zinc-400 hover:text-white flex items-center gap-2 transition-colors"
            >
              <ChevronRight className="rotate-180" size={20} /> Write Another
            </button>
            <div className="flex gap-3">
              <button 
                onClick={handleDownloadWord}
                disabled={isDownloading}
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl font-semibold transition-colors flex items-center gap-2 border border-white/10 disabled:opacity-50"
              >
                {isDownloading ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
                {isDownloading ? 'Preparing...' : 'Download Word'}
              </button>
              <Link 
                to="/dashboard"
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-xl font-semibold transition-colors"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>

          <div id="blog-content-to-download" className="bg-zinc-950 p-4 rounded-xl">
            <h1 className="text-4xl font-bold mb-6 text-white">{generatedBlog.title}</h1>
            <div className="flex gap-4 mb-8 text-sm text-zinc-500">
              <span className="bg-white/5 px-3 py-1 rounded-full border border-white/10 uppercase tracking-wider">{generatedBlog.tone}</span>
              <span className="bg-white/5 px-3 py-1 rounded-full border border-white/10 uppercase tracking-wider">{generatedBlog.language}</span>
            </div>

            <div className="markdown-body">
              <Markdown>{generatedBlog.content}</Markdown>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="pt-32 pb-20 px-6 max-w-3xl mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass p-8 rounded-3xl"
      >
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <Sparkles className="text-purple-500" /> Create New Blog
        </h1>
        <form onSubmit={handleGenerate} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">What's your blog topic?</label>
            <textarea 
              className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 min-h-[120px]"
              placeholder="e.g. The future of AI in 2026, How to cook perfect Pho..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Tone of Voice</label>
              <select 
                className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="humorous">Humorous</option>
                <option value="educational">Educational</option>
                <option value="seo-optimized">SEO Optimized</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Language</label>
              <select 
                className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="Tiếng Việt">Tiếng Việt</option>
                <option value="English">English</option>
                <option value="Japanese">Japanese</option>
                <option value="French">French</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Blog Length</label>
              <select 
                className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500"
                value={length}
                onChange={(e) => setLength(e.target.value)}
              >
                <option value="short">Short: 300-500 words.</option>
                <option value="standard">Standard: 800-1,200 words.</option>
                <option value="long">In-depth: 1,500+ words.</option>
              </select>
            </div>
          </div>
          <button 
            type="submit" 
            disabled={isGenerating}
            className="w-full bg-gradient-to-r from-purple-600 to-emerald-600 hover:from-purple-700 hover:to-emerald-700 text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 className="animate-spin" /> Generating Magic...
              </>
            ) : (
              <>
                <Sparkles size={20} /> Generate Blog Post
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const EditBlog = () => {
  const { id } = useParams();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchBlog = async () => {
      try {
        const res = await axios.get(`/api/blogs/${id}`);
        setTitle(res.data.title);
        setContent(res.data.content);
        setExcerpt(res.data.excerpt);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchBlog();
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await axios.put(`/api/blogs/${id}`, 
        { title, content, excerpt },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      navigate('/dashboard');
    } catch (err) {
      alert('Lỗi khi lưu bài viết');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div className="pt-40 text-center"><Loader2 className="animate-spin mx-auto" /></div>;

  return (
    <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Sửa bài viết</h1>
      <form onSubmit={handleSave} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-2">Tiêu đề</label>
          <input 
            type="text" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-purple-500 transition-colors"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-2">Tóm tắt</label>
          <textarea 
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-purple-500 transition-colors h-24"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-2">Nội dung (Markdown)</label>
          <textarea 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-purple-500 transition-colors h-96 font-mono"
            required
          />
        </div>
        <div className="flex gap-4">
          <button 
            type="submit"
            disabled={isSaving}
            className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : 'Lưu thay đổi'}
          </button>
          <button 
            type="button"
            onClick={() => navigate('/dashboard')}
            className="bg-white/5 hover:bg-white/10 text-white px-8 py-3 rounded-xl font-semibold transition-colors"
          >
            Hủy
          </button>
        </div>
      </form>
    </div>
  );
};

const BlogDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [blog, setBlog] = useState<Blog | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const { token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchBlog = async () => {
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await axios.get(`/api/blogs/${id}`, { headers });
        setBlog(res.data);
      } catch (err) {
        navigate('/dashboard');
      }
    };
    fetchBlog();
  }, [id, token, navigate]);

  const handleDownloadWord = async () => {
    if (!blog) return;

    setIsDownloading(true);
    try {
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              text: blog.title,
              heading: HeadingLevel.HEADING_1,
              spacing: { after: 400 },
            }),
            ...blog.content.split('\n').map((line: string) => {
              const trimmed = line.trim();
              if (trimmed.startsWith('### ')) {
                return new Paragraph({ text: trimmed.replace('### ', ''), heading: HeadingLevel.HEADING_3, spacing: { before: 240, after: 120 } });
              } else if (trimmed.startsWith('## ')) {
                return new Paragraph({ text: trimmed.replace('## ', ''), heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } });
              } else if (trimmed.startsWith('# ')) {
                return new Paragraph({ text: trimmed.replace('# ', ''), heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } });
              } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return new Paragraph({ text: trimmed.substring(2), bullet: { level: 0 }, spacing: { after: 120 } });
              } else if (trimmed === '') {
                return new Paragraph({ text: '', spacing: { after: 120 } });
              } else {
                return new Paragraph({
                  children: [new TextRun(trimmed)],
                  spacing: { after: 200 },
                });
              }
            }),
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${blog.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.docx`);
    } catch (err: any) {
      console.error('Word Download error:', err);
      alert('Không thể tải xuống bản Word.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!blog) return <div className="pt-40 text-center"><Loader2 className="animate-spin mx-auto" /></div>;

  return (
    <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <Link to="/dashboard" className="text-zinc-400 hover:text-white flex items-center gap-2 transition-colors">
          <ArrowLeft size={18} /> Back to Dashboard
        </Link>
        <button 
          onClick={handleDownloadWord}
          disabled={isDownloading}
          className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl font-semibold transition-colors flex items-center gap-2 border border-white/10 disabled:opacity-50"
        >
          {isDownloading ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
          {isDownloading ? 'Preparing...' : 'Download Word'}
        </button>
      </div>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        id="blog-detail-content"
        className="bg-zinc-950 p-4 rounded-xl"
      >
        <h1 className="text-4xl md:text-5xl font-bold mb-6">{blog.title}</h1>
        <div className="flex items-center gap-4 mb-12 text-zinc-500 text-sm">
          <span>{new Date(blog.created_at).toLocaleDateString()}</span>
          <span>•</span>
          <span className="capitalize">{blog.tone}</span>
          <span>•</span>
          <span>{blog.language}</span>
        </div>
        <div className="markdown-body">
          <Markdown>{blog.content}</Markdown>
        </div>
      </motion.div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      <div className="min-h-screen bg-zinc-950">
        <Navbar />
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/write" element={<WriteBlog />} />
            <Route path="/edit/:id" element={<EditBlog />} />
            <Route path="/blog/:id" element={<BlogDetail />} />
          </Routes>
        </AnimatePresence>
      </div>
    </AuthContext.Provider>
  );
}
