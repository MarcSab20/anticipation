import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';

// Étendre l'interface Request pour inclure l'utilisateur
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export function authMiddleware(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized: No token provided' });
      }
      
      const token = authHeader.split(' ')[1];
      
      try {
        // Valider le token et récupérer les informations utilisateur
        const userInfo = await authService.validateToken(token);
        
        // Stocker les informations utilisateur dans la requête
        req.user = userInfo;
        
        next();
      } catch (error) {
        return res.status(401).json({ message: 'Unauthorized: Invalid token' });
      }
    } catch (error) {
      console.error('Error in auth middleware:', error);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  };
}