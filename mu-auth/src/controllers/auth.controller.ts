import { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';

export class AuthController {
  private authService: AuthService;
  
  constructor(authService: AuthService) {
    this.authService = authService;
  }
  
  /**
   * Authentifie un utilisateur
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        res.status(400).json({ message: 'Username and password are required' });
        return;
      }
      
      const { accessToken, refreshToken } = await this.authService.authenticateUser(username, password);
      
      res.status(200).json({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer'
      });
    } catch (error) {
      console.error('Error in login controller:', error);
      res.status(401).json({ message: 'Invalid credentials' });
    }
  }
  
  /**
   * Rafraîchit un token
   */
  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refresh_token } = req.body;
      
      if (!refresh_token) {
        res.status(400).json({ message: 'Refresh token is required' });
        return;
      }
      
      const { accessToken, refreshToken } = await this.authService.refreshUserToken(refresh_token);
      
      res.status(200).json({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer'
      });
    } catch (error) {
      console.error('Error in refresh token controller:', error);
      res.status(401).json({ message: 'Invalid refresh token' });
    }
  }
  
  /**
   * Déconnecte un utilisateur
   */
  async logout(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(400).json({ message: 'Token is required' });
        return;
      }
      
      const token = authHeader.split(' ')[1];
      
      await this.authService.logoutUser(token);
      
      res.status(204).send();
    } catch (error) {
      console.error('Error in logout controller:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  }
  
  /**
   * Valide un token et retourne les informations utilisateur
   */
  async validateToken(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.body;
      
      if (!token) {
        res.status(400).json({ message: 'Token is required' });
        return;
      }
      
      const userInfo = await this.authService.validateToken(token);
      
      res.status(200).json(userInfo);
    } catch (error) {
      console.error('Error validating token:', error);
      res.status(401).json({ message: 'Invalid token' });
    }
  }
  
  /**
   * Récupère les informations d'un utilisateur
   */
  async getUserInfo(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        res.status(400).json({ message: 'User ID is required' });
        return;
      }
      
      const userInfo = await this.authService.getUserInfo(userId);
      
      res.status(200).json(userInfo);
    } catch (error) {
      console.error('Error getting user info:', error);
      res.status(404).json({ message: 'User not found' });
    }
  }
  
  /**
   * Récupère les rôles d'un utilisateur
   */
  async getUserRoles(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        res.status(400).json({ message: 'User ID is required' });
        return;
      }
      
      const roles = await this.authService.getUserRoles(userId);
      
      res.status(200).json({ roles });
    } catch (error) {
      console.error('Error getting user roles:', error);
      res.status(404).json({ message: 'User not found' });
    }
  }
  
  /**
   * Récupère un token administrateur
   */
  async getAdminToken(req: Request, res: Response): Promise<void> {
    try {
      const token = await this.authService.getAdminToken();
      
      res.status(200).json({ token });
    } catch (error) {
      console.error('Error getting admin token:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  }
}