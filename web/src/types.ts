export interface PublicUser {
  id: string;
  username: string;
  role: 'admin' | 'teacher' | 'student';
  displayName: string;
  status: string;
  mustChangePassword: boolean;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
