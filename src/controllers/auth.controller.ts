import type { FastifyInstance } from 'fastify'

type User = {
  id: number
  name: string
  email: string
  password: string
  phone: string
}

const users: User[] = [
  {
    id: 1,
    name: 'Usuário Teste',
    email: 'teste@email.com',
    password: '123456',
    phone: '(88) 99999-9999',
  },
]

export async function authController(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    try {
      const { name, email, password, confirmPassword, phone } = request.body as {
        name?: string
        email?: string
        password?: string
        confirmPassword?: string
        phone?: string
      }

      if (!name || !email || !password || !confirmPassword || !phone) {
        return reply.status(400).send({
          message: 'Todos os campos são obrigatórios',
        })
      }

      if (password !== confirmPassword) {
        return reply.status(400).send({
          message: 'As senhas não coincidem',
        })
      }

      const userExists = users.find((user) => user.email === email)

      if (userExists) {
        return reply.status(400).send({
          message: 'E-mail já cadastrado',
        })
      }

      const newUser: User = {
        id: users.length + 1,
        name,
        email,
        password,
        phone,
      }

      users.push(newUser)

      return reply.status(201).send({
        message: 'Usuário cadastrado com sucesso',
        data: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          phone: newUser.phone,
        },
      })
    } catch {
      return reply.status(500).send({
        message: 'Erro interno do servidor',
      })
    }
  })

  app.post('/login', async (request, reply) => {
    try {
      const { email, password } = request.body as {
        email?: string
        password?: string
      }

      if (!email || !password) {
        return reply.status(400).send({
          message: 'E-mail e senha são obrigatórios',
        })
      }

      const user = users.find((user) => user.email === email)

      if (!user || user.password !== password) {
        return reply.status(401).send({
          message: 'E-mail ou senha inválidos',
        })
      }

      return reply.status(200).send({
        message: 'Login realizado com sucesso',
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      })
    } catch {
      return reply.status(500).send({
        message: 'Erro interno do servidor',
      })
    }
  })
}
