
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, ChevronLeft, ChevronRight, Trash2, Send } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";

interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  created_at: string;
  expires_at: string;
  user?: {
    username: string;
    avatar_url: string;
  };
}

interface StoryComment {
  id: string;
  story_id: string;
  user_id: string;
  text: string;
  created_at: string;
  profiles?: {
    username: string;
    avatar_url: string;
  };
}

const StoryViewer = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [commentText, setCommentText] = useState("");
  const [showComments, setShowComments] = useState(false);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);

  // Verificar se o usuário atual é o dono das histórias
  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      return user;
    },
  });

  const isOwner = currentUser?.id === userId;

  // Buscar histórias do usuário
  const { data: stories, isLoading } = useQuery({
    queryKey: ["viewStories", userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data: userData, error: userError } = await supabase
        .from("profiles")
        .select("username, avatar_url")
        .eq("id", userId)
        .single();

      if (userError) throw userError;

      const { data, error } = await supabase
        .from("stories")
        .select("*")
        .eq("user_id", userId)
        .gt("expires_at", new Date().toISOString())
        .order("created_at");

      if (error) throw error;

      // Adicionar as informações do usuário a cada história
      return data.map((story: Story) => ({
        ...story,
        user: userData
      }));
    },
    enabled: !!userId,
  });

  // Buscar comentários da história atual
  const { data: comments, isLoading: isLoadingComments } = useQuery({
    queryKey: ["storyComments", stories?.[currentStoryIndex]?.id],
    queryFn: async () => {
      if (!stories || stories.length === 0 || currentStoryIndex >= stories.length) return [];
      
      const { data, error } = await supabase
        .from("story_comments")
        .select("*, profiles:user_id(username, avatar_url)")
        .eq("story_id", stories[currentStoryIndex].id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      return data as StoryComment[];
    },
    enabled: !!stories && stories.length > 0 && currentStoryIndex < stories.length,
  });

  // Verificar se o usuário atual curtiu a história atual
  const checkUserLike = async (storyId: string) => {
    if (!currentUser || !storyId) return;

    const { data, error } = await supabase
      .from("story_likes")
      .select("id")
      .eq("story_id", storyId)
      .eq("user_id", currentUser.id)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Erro ao verificar curtida:", error);
      return;
    }

    setHasLiked(!!data);
  };

  // Contar o número de curtidas para a história atual
  const fetchLikesCount = async (storyId: string) => {
    if (!storyId) return;

    const { count, error } = await supabase
      .from("story_likes")
      .select("id", { count: "exact", head: true })
      .eq("story_id", storyId);

    if (error) {
      console.error("Erro ao contar curtidas:", error);
      return;
    }

    setLikesCount(count || 0);
  };

  // Quando a história atual muda, verificar curtida e contar curtidas
  useEffect(() => {
    if (!stories || stories.length === 0 || currentStoryIndex >= stories.length) return;
    
    const storyId = stories[currentStoryIndex].id;
    checkUserLike(storyId);
    fetchLikesCount(storyId);
    setShowComments(false);
  }, [currentStoryIndex, stories, currentUser]);

  // Mutação para marcar uma história como visualizada
  const markAsViewedMutation = useMutation({
    mutationFn: async (storyId: string) => {
      if (!currentUser || isOwner) return;

      const { error } = await supabase
        .from("story_views")
        .upsert({
          story_id: storyId,
          viewer_id: currentUser.id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userStories"] });
    },
  });

  // Mutação para curtir/descurtir uma história
  const toggleLikeMutation = useMutation({
    mutationFn: async (storyId: string) => {
      if (!currentUser) return;

      if (hasLiked) {
        // Remover curtida
        const { error } = await supabase
          .from("story_likes")
          .delete()
          .eq("story_id", storyId)
          .eq("user_id", currentUser.id);

        if (error) throw error;
        
        return { action: 'unlike' };
      } else {
        // Adicionar curtida
        const { error } = await supabase
          .from("story_likes")
          .insert({
            story_id: storyId,
            user_id: currentUser.id,
          });

        if (error) throw error;
        
        return { action: 'like' };
      }
    },
    onSuccess: (data, storyId) => {
      // Atualizar o estado local
      setHasLiked(!hasLiked);
      setLikesCount(prev => data?.action === 'like' ? prev + 1 : prev - 1);
      
      // Mostrar toast de confirmação
      toast.success(data?.action === 'like' ? "Story curtido!" : "Curtida removida");
      
      // Invalidar consultas relevantes
      queryClient.invalidateQueries({ queryKey: ["storyLikes", storyId] });
    },
    onError: (error) => {
      console.error("Erro ao curtir/descurtir:", error);
      toast.error("Erro ao processar sua curtida");
    }
  });

  // Mutação para adicionar um comentário
  const addCommentMutation = useMutation({
    mutationFn: async ({ storyId, text }: { storyId: string, text: string }) => {
      if (!currentUser) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("story_comments")
        .insert({
          story_id: storyId,
          user_id: currentUser.id,
          text: text,
        })
        .select("*, profiles:user_id(username, avatar_url)")
        .single();

      if (error) throw error;
      
      return data as StoryComment;
    },
    onSuccess: () => {
      // Limpar o campo de texto e atualizar a lista de comentários
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["storyComments", stories?.[currentStoryIndex]?.id] });
      toast.success("Comentário adicionado!");
    },
    onError: (error) => {
      console.error("Erro ao adicionar comentário:", error);
      toast.error("Erro ao adicionar comentário");
    }
  });

  // Mutação para excluir uma história
  const deleteStoryMutation = useMutation({
    mutationFn: async (storyId: string) => {
      const { error } = await supabase
        .from("stories")
        .delete()
        .eq("id", storyId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userStories"] });
      queryClient.invalidateQueries({ queryKey: ["viewStories"] });
      toast.success("História excluída com sucesso");
      
      // Se não há mais histórias, voltar para a página inicial
      if (stories && stories.length <= 1) {
        navigate("/");
      }
    },
    onError: (error) => {
      console.error("Error deleting story:", error);
      toast.error("Erro ao excluir história");
    },
  });

  // Iniciar o temporizador de progresso
  useEffect(() => {
    if (isLoading || !stories || stories.length === 0) return;

    // Limpar qualquer intervalo anterior
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
    }

    // Marcar a história atual como visualizada
    if (stories[currentStoryIndex]) {
      markAsViewedMutation.mutate(stories[currentStoryIndex].id);
    }

    // Se for um vídeo, usar a duração do vídeo como temporizador
    if (videoRef.current && stories[currentStoryIndex]?.media_type === 'video') {
      // Os eventos do vídeo lidarão com o progresso
      setProgress(0);
      return;
    }

    // Parar o timer se os comentários estiverem abertos
    if (showComments) {
      return;
    }

    // Configurar um temporizador para imagens (5 segundos)
    const duration = 5000; // 5 segundos por história
    const interval = 50; // Atualizar a cada 50ms para suavidade
    const step = (interval / duration) * 100;
    
    setProgress(0);
    
    progressInterval.current = setInterval(() => {
      setProgress((prev) => {
        const newProgress = prev + step;
        if (newProgress >= 100) {
          goToNextStory();
          return 0;
        }
        return newProgress;
      });
    }, interval);

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, [currentStoryIndex, isLoading, stories, showComments]);

  // Pausar o temporizador quando os comentários estão abertos
  useEffect(() => {
    if (showComments && progressInterval.current) {
      clearInterval(progressInterval.current);
    } else if (!showComments && stories && stories.length > 0 && !isLoading) {
      // Reiniciar o temporizador se os comentários forem fechados
      const duration = 5000;
      const interval = 50;
      const step = (interval / duration) * 100;
      
      progressInterval.current = setInterval(() => {
        setProgress((prev) => {
          const newProgress = prev + step;
          if (newProgress >= 100) {
            goToNextStory();
            return 0;
          }
          return newProgress;
        });
      }, interval);
    }

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, [showComments]);

  // Manipular eventos de vídeo
  const handleVideoProgress = () => {
    if (!videoRef.current) return;
    
    const { currentTime, duration } = videoRef.current;
    const calculatedProgress = (currentTime / duration) * 100;
    setProgress(calculatedProgress);
  };

  const handleVideoEnded = () => {
    goToNextStory();
  };

  // Navegar para a próxima história
  const goToNextStory = () => {
    if (!stories || stories.length === 0) return;
    
    if (currentStoryIndex < stories.length - 1) {
      setCurrentStoryIndex(currentStoryIndex + 1);
    } else {
      // Voltar para a tela anterior quando terminar todas as histórias
      navigate(-1);
    }
  };

  // Navegar para a história anterior
  const goToPrevStory = () => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex(currentStoryIndex - 1);
    }
  };

  // Manipular a exclusão de uma história
  const handleDeleteStory = () => {
    if (!stories) return;
    
    if (confirm("Tem certeza que deseja excluir esta história?")) {
      deleteStoryMutation.mutate(stories[currentStoryIndex].id);
    }
  };

  // Manipular curtida
  const handleLikeStory = () => {
    if (!stories || !currentUser) return;
    
    toggleLikeMutation.mutate(stories[currentStoryIndex].id);
  };

  // Manipular envio de comentário
  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !stories || !currentUser) return;
    
    addCommentMutation.mutate({
      storyId: stories[currentStoryIndex].id,
      text: commentText.trim()
    });
  };

  // Alternar exibição de comentários
  const toggleComments = () => {
    setShowComments(!showComments);
    
    // Focar no input de comentário quando os comentários são exibidos
    if (!showComments && commentInputRef.current) {
      setTimeout(() => {
        commentInputRef.current?.focus();
      }, 300);
    }
  };

  // Se estiver carregando ou não houver histórias, mostrar um estado de carregamento
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!stories || stories.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-white">
        <p className="text-xl mb-4">Não há histórias para mostrar</p>
        <Button onClick={() => navigate(-1)}>Voltar</Button>
      </div>
    );
  }

  const currentStory = stories[currentStoryIndex];

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Barra de progresso */}
      <div className="absolute top-0 left-0 right-0 z-10 p-2 flex gap-1">
        {stories.map((_, index) => (
          <div key={index} className="h-1 bg-gray-600 flex-1 rounded-full overflow-hidden">
            <div 
              className={`h-full bg-white transition-all duration-100 ease-linear ${index < currentStoryIndex ? 'w-full' : index === currentStoryIndex ? '' : 'w-0'}`}
              style={{ width: index === currentStoryIndex ? `${progress}%` : index < currentStoryIndex ? '100%' : '0%' }}
            ></div>
          </div>
        ))}
      </div>

      {/* Cabeçalho - informações do usuário */}
      <div className="absolute top-4 left-0 right-0 z-10 px-4 pt-4">
        <div className="flex items-center">
          <Avatar className="h-10 w-10 mr-3 border border-white">
            <AvatarImage 
              src={currentStory.user?.avatar_url || undefined} 
              alt={currentStory.user?.username || "Usuário"} 
            />
            <AvatarFallback>
              {currentStory.user?.username?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="text-white font-medium">
              {currentStory.user?.username || "Usuário"}
            </p>
            <p className="text-gray-300 text-xs">
              {new Date(currentStory.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-white" 
            onClick={() => navigate(-1)}
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
      </div>

      {/* Conteúdo da história */}
      <div className="flex-1 flex items-center justify-center">
        {currentStory.media_type === 'video' ? (
          <video
            ref={videoRef}
            src={currentStory.media_url}
            className="max-h-screen max-w-full object-contain"
            autoPlay
            playsInline
            onTimeUpdate={handleVideoProgress}
            onEnded={handleVideoEnded}
            controls={false}
          />
        ) : (
          <img
            src={currentStory.media_url}
            alt="Story"
            className="max-h-screen max-w-full object-contain"
          />
        )}
      </div>

      {/* Botões de navegação */}
      <div className="absolute inset-0 flex">
        <div 
          className="w-1/2 h-full" 
          onClick={goToPrevStory}
        />
        <div 
          className="w-1/2 h-full" 
          onClick={goToNextStory}
        />
      </div>

      {/* Botões de navegação visíveis para debugging */}
      <div className="absolute bottom-4 left-0 right-0 flex justify-between px-4 opacity-0 hover:opacity-100 transition-opacity">
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-white" 
          onClick={goToPrevStory}
          disabled={currentStoryIndex === 0}
        >
          <ChevronLeft className="h-8 w-8" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-white" 
          onClick={goToNextStory}
        >
          <ChevronRight className="h-8 w-8" />
        </Button>
      </div>

      {/* Área de comentários */}
      <div 
        className={`absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md rounded-t-3xl transition-all duration-300 ease-in-out overflow-hidden ${
          showComments ? 'h-[60vh]' : 'h-0'
        }`}
      >
        <div className="p-4 h-full flex flex-col">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-1 bg-gray-700 rounded-full"></div>
          </div>
          
          <h3 className="text-white font-semibold mb-4">Comentários</h3>
          
          <div className="flex-1 overflow-y-auto">
            {isLoadingComments ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-white"></div>
              </div>
            ) : comments && comments.length > 0 ? (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex items-start gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage 
                        src={comment.profiles?.avatar_url || undefined} 
                        alt={comment.profiles?.username || "Usuário"} 
                      />
                      <AvatarFallback>
                        {comment.profiles?.username?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="bg-gray-800 rounded-2xl px-4 py-3 flex-1">
                      <p className="text-white text-sm font-medium">
                        {comment.profiles?.username || "Usuário"}
                      </p>
                      <p className="text-white text-sm mt-1">{comment.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-400 py-8">
                Sem comentários ainda
              </div>
            )}
          </div>
          
          <form onSubmit={handleAddComment} className="mt-4 flex items-center gap-2">
            <Avatar className="h-8 w-8 shrink-0">
              {currentUser && (
                <>
                  <AvatarImage 
                    src={currentUser.user_metadata?.avatar_url || undefined} 
                    alt={currentUser.user_metadata?.full_name || "Você"} 
                  />
                  <AvatarFallback>
                    {currentUser.user_metadata?.full_name?.charAt(0).toUpperCase() || "V"}
                  </AvatarFallback>
                </>
              )}
            </Avatar>
            <Input
              ref={commentInputRef}
              type="text"
              placeholder="Adicione um comentário..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              className="flex-1 bg-gray-700 border-none text-white rounded-full placeholder:text-gray-400"
            />
            <Button 
              type="submit" 
              size="icon" 
              variant="ghost" 
              className="text-white"
              disabled={!commentText.trim()}
            >
              <Send className="h-5 w-5" />
            </Button>
          </form>
        </div>
      </div>

      {/* Barra de ações inferior */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-black/40 backdrop-blur-sm">
        <div className="px-4 py-3 flex items-center">
          <div className="flex-1">
            <form onSubmit={handleAddComment} className="flex items-center">
              <Input
                type="text"
                placeholder="Enviar mensagem"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="bg-gray-800/60 border-0 text-white rounded-full placeholder:text-gray-400"
                onClick={() => setShowComments(true)}
              />
            </form>
          </div>
          <div className="flex items-center gap-4 ml-4">
            <button 
              className="flex items-center justify-center"
              onClick={handleLikeStory}
            >
              <img 
                src={hasLiked ? "/amei1.png" : "/curtidas.png"} 
                alt={hasLiked ? "Amei" : "Curtir"} 
                className="h-7 w-7"
              />
            </button>
            <button 
              className="flex items-center justify-center"
              onClick={toggleComments}
            >
              <img 
                src="/comentario.png" 
                alt="Comentar" 
                className="h-7 w-7"
              />
            </button>
          </div>
        </div>
      </div>

      {/* Botão de excluir para o proprietário */}
      {isOwner && (
        <div className="absolute bottom-20 right-4">
          <Button 
            variant="destructive" 
            size="icon" 
            onClick={handleDeleteStory}
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default StoryViewer;
