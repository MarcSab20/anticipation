import { Router, Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { AuthController } from '../controllers/auth.controller';

export function authRoutes(authService: AuthService): Router {
  const router = Router();
  const authController = new AuthController(authService);
  
  // Routes d'authentification
  router.post('/login', (req: Request, res: Response) => authController.login(req, res));
  router.post('/refresh-token', (req: Request, res: Response) => authController.refreshToken(req, res));
  router.post('/logout', (req: Request, res: Response) => authController.logout(req, res));
  
  // Route pour valider un token
  router.post('/validate', (req: Request, res: Response) => authController.validateToken(req, res));
  
  // Routes pour les utilisateurs
  router.get('/users/:userId', (req: Request, res: Response) => authController.getUserInfo(req, res));
  router.get('/users/:userId/roles', (req: Request, res: Response) => authController.getUserRoles(req, res));
  
  // Route pour le token administrateur
  router.get('/admin-token', (req: Request, res: Response) => authController.getAdminToken(req, res));
  
  return router;
}