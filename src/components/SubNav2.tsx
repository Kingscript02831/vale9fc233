
import { Link, useLocation } from "react-router-dom";
import { useSiteConfig } from "../hooks/useSiteConfig";

const SubNav2 = () => {
  const { data: config, isLoading, isError } = useSiteConfig();
  const location = useLocation();

  const links = [
    { path: "/admin/noticias", label: "Notícias" },
    { path: "/admin/eventos", label: "Eventos" },
    { path: "/admin/lugares", label: "Lugares" },
    { path: "/admin/categorias", label: "Categorias" },
    { path: "/admin/sistema", label: "Sistema" },
    { path: "/config", label: "Configurações" },
  ];

  if (isLoading) {
    return (
      <nav className="w-full border-b mt-16 h-12 animate-pulse bg-gray-200" />
    );
  }

  if (isError || !config) {
    return (
      <nav className="w-full border-b mt-16 bg-gray-800">
        <div className="max-w-screen-2xl mx-auto px-4">
          <div className="flex overflow-x-auto scrollbar-hide py-2 gap-x-8">
            {links.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className="text-white hover:opacity-80 transition-opacity whitespace-nowrap"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav 
      className="w-full border-b mt-16 shadow-sm"
      style={{ 
        background: `linear-gradient(to right, ${config.navbar_color}, ${config.primary_color})`,
        borderColor: `${config.primary_color}20`
      }}
    >
      <div className="max-w-screen-2xl mx-auto px-4">
        <div className="flex overflow-x-auto scrollbar-hide py-2 gap-x-8">
          {links.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`text-white hover:opacity-80 transition-all transform hover:-translate-x-1 duration-200 whitespace-nowrap ${
                location.pathname === link.path ? "border-b-2" : ""
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default SubNav2;
