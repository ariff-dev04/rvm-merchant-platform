import { createRouter, createWebHistory } from 'vue-router'

// Import your views
import Dashboard from '../views/Dashboard.vue'
import Withdrawals from '../views/Withdrawal.vue'
import Users from '../views/Users.vue'
import UserDetail from '../views/UserDetail.vue'
import MachineStatus from '../views/MachineStatus.vue'
import Login from '../views/Login.vue'          
import AdminManager from '../views/AdminManager.vue'  

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', 
      name: 'login', 
      component: Login,
      meta: { hideSidebar: true }},
    {
      path: '/',
      name: 'dashboard',
      component: Dashboard
    },
    {
      path: '/submissions',
      name: 'submissions',
      component: () => import('../views/Submissions.vue')
    },
    {
      path: '/withdrawals',
      name: 'withdrawals',
      component: Withdrawals
    },
    {
      path: '/users',
      name: 'users',
      component: Users
    },
    {
      path: '/users/:id',
      name: 'userDetail',
      component: UserDetail
    },
    {
      path: '/machines',
      name: 'machines',
      component: MachineStatus
    },
    { path: '/admins', 
      component: AdminManager },

    {
      path: '/cleaning-logs',
      name: 'CleaningLogs',
      component: () => import('../views/CleaningLogs.vue')
    }   
  ]
})

export default router