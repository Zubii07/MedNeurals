import { useState } from 'react'
import { toast } from 'sonner'
import { Pencil, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import PageHeader from '@/components/common/PageHeader'
import ToneBadge from '@/components/common/ToneBadge'
import { useCreateUser, useUpdateUser, useUsers } from '@/api/hooks'
import { errorMessage } from '@/api/client'
import { useAuth } from '@/auth/AuthProvider'
import { ROLES, ROLE_META, enumMeta } from '@/lib/enums'
import { EM_DASH, formatDateTime } from '@/lib/format'

const HEAD = 'h-9 bg-muted/60 px-2 text-xs font-medium text-muted-foreground first:rounded-l-lg last:rounded-r-lg'

/** Password rule enforced by POST /users and PATCH /users/{id}. */
const PASSWORD_MIN = 8
const PASSWORD_MAX = 72

function passwordProblem(password, { optional = false } = {}) {
  if (password === '') return optional ? null : 'Enter a password.'
  if (password.length < PASSWORD_MIN) return `The password must be at least ${PASSWORD_MIN} characters.`
  if (password.length > PASSWORD_MAX) return `The password must be at most ${PASSWORD_MAX} characters.`
  return null
}

/** Role dropdown shared by both dialogs. */
function RoleSelect({ id, value, onValueChange, disabled }) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} className="h-9 w-full bg-card">
        <SelectValue placeholder="Choose a role" />
      </SelectTrigger>
      <SelectContent position="popper">
        {ROLES.map((role) => (
          <SelectItem key={role} value={role}>
            {ROLE_META[role].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Red one-line message under a form. */
function FormError({ id, message }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="text-sm font-medium text-danger">
      {message}
    </p>
  )
}

/** "Add user" dialog: name, email, role, password. Creates with POST /users. */
function AddUserDialog({ open, onOpenChange }) {
  const create = useCreateUser()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('PROCUREMENT_OFFICER')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState(null)

  const reset = () => {
    setName('')
    setEmail('')
    setRole('PROCUREMENT_OFFICER')
    setPassword('')
    setLocalError(null)
    create.reset()
  }

  const close = (next) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const problem = passwordProblem(password)
    if (!name.trim() || !email.trim()) {
      setLocalError('Enter a name and an email address.')
      return
    }
    if (problem) {
      setLocalError(problem)
      return
    }
    setLocalError(null)
    create.mutate(
      { name: name.trim(), email: email.trim(), role, password },
      {
        onSuccess: (user) => {
          toast.success('User added', { description: `${user.name} can now sign in as ${enumMeta(ROLE_META, user.role).label.toLowerCase()}.` })
          close(false)
        },
      },
    )
  }

  const error = localError ?? (create.isError ? errorMessage(create.error) : null)
  const busy = create.isPending

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>The new user signs in with this email and password. They can change nothing about their own account.</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="add-name">Name</Label>
            <Input id="add-name" value={name} onChange={(event) => setName(event.target.value)} disabled={busy} autoFocus required className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-email">Email</Label>
            <Input id="add-email" type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} required className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-role">Role</Label>
            <RoleSelect id="add-role" value={role} onValueChange={setRole} disabled={busy} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-password">Password</Label>
            <Input id="add-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} required className="h-9" />
            <p className="text-xs text-muted-foreground">
              {PASSWORD_MIN} to {PASSWORD_MAX} characters.
            </p>
          </div>

          <FormError id="add-error" message={error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Adding…' : 'Add user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Per-row "Edit" dialog: name, email, role, active switch and an optional new password. Only changed fields are
 * sent with PATCH /users/{id}. The backend refuses deactivating or demoting yourself or the last active admin (400).
 * @param {{ user: import('@/api/shapes').User | null, onClose: () => void, isSelf: boolean }} props
 */
function EditUserDialog({ user, onClose, isSelf }) {
  const update = useUpdateUser()
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [role, setRole] = useState(user?.role ?? 'PROCUREMENT_OFFICER')
  const [isActive, setIsActive] = useState(user?.is_active ?? true)
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState(null)

  if (!user) return null

  const changes = {}
  if (name.trim() !== user.name) changes.name = name.trim()
  if (email.trim() !== user.email) changes.email = email.trim()
  if (role !== user.role) changes.role = role
  if (isActive !== user.is_active) changes.is_active = isActive
  if (password !== '') changes.password = password
  const hasChanges = Object.keys(changes).length > 0

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!name.trim() || !email.trim()) {
      setLocalError('Name and email cannot be empty.')
      return
    }
    const problem = passwordProblem(password, { optional: true })
    if (problem) {
      setLocalError(problem)
      return
    }
    if (!hasChanges) {
      onClose()
      return
    }
    setLocalError(null)
    update.mutate(
      { id: user.id, changes },
      {
        onSuccess: (saved) => {
          toast.success('User updated', { description: `Changes to ${saved.name} were saved.` })
          onClose()
        },
      },
    )
  }

  const error = localError ?? (update.isError ? errorMessage(update.error) : null)
  const busy = update.isPending

  return (
    <Dialog open onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>
              {isSelf ? 'This is your own account. You cannot deactivate it or remove your administrator role.' : 'Leave the password empty to keep the current one.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" value={name} onChange={(event) => setName(event.target.value)} disabled={busy} required className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-email">Email</Label>
            <Input id="edit-email" type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} required className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-role">Role</Label>
            <RoleSelect id="edit-role" value={role} onValueChange={setRole} disabled={busy || isSelf} />
          </div>
          <div className="flex h-9 items-center gap-2">
            <Switch id="edit-active" checked={isActive} onCheckedChange={setIsActive} disabled={busy || isSelf} />
            <Label htmlFor="edit-active" className="text-sm font-normal text-foreground">
              {isActive ? 'Active: can sign in' : 'Deactivated: cannot sign in'}
            </Label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-password">New password</Label>
            <Input id="edit-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} className="h-9" placeholder="Leave empty to keep the current password" />
          </div>

          <FormError id="edit-error" message={error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !hasChanges}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Users (`/admin/users`, administrators only, stage 6): every account with its role, status and last sign-in.
 * Administrators add users and edit them here; there is no delete, accounts are deactivated instead.
 */
export default function UsersPage() {
  const { user: me } = useAuth()
  const query = useUsers()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)

  const rows = query.data?.items ?? []

  let body
  if (query.isPending) {
    body = (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </div>
    )
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={query.refetch} retrying={query.isFetching} />
  } else if (rows.length === 0) {
    body = <EmptyState icon={Users} title="No users yet." description="Add the first procurement officer with the button above." />
  } else {
    body = (
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead className={HEAD}>Name</TableHead>
            <TableHead className={HEAD}>Email</TableHead>
            <TableHead className={HEAD}>Role</TableHead>
            <TableHead className={HEAD}>Status</TableHead>
            <TableHead className={HEAD}>Last sign-in</TableHead>
            <TableHead className={`${HEAD} text-right`}>
              <span className="sr-only">Edit</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isSelf = me?.id === row.id
            return (
              <TableRow key={row.id} className="border-border/70">
                <TableCell className="w-full min-w-[180px] max-w-0 px-2 py-2.5">
                  <span className="block truncate text-sm font-medium text-foreground" title={row.name}>
                    {row.name}
                    {isSelf ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span> : null}
                  </span>
                </TableCell>
                <TableCell className="px-2 py-2.5 text-sm">{row.email}</TableCell>
                <TableCell className="px-2 py-2.5 text-sm whitespace-nowrap">{enumMeta(ROLE_META, row.role).label}</TableCell>
                <TableCell className="px-2 py-2.5">
                  {row.is_active ? <ToneBadge label="Active" tone="success" icon={null} className="px-2" /> : <ToneBadge label="Deactivated" tone="neutral" icon={null} className="px-2" />}
                </TableCell>
                <TableCell className="px-2 py-2.5 text-sm whitespace-nowrap text-muted-foreground">{row.last_login_at ? formatDateTime(row.last_login_at) : <span title="Has not signed in yet">{EM_DASH}</span>}</TableCell>
                <TableCell className="px-2 py-2.5 text-right">
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setEditing(row)}>
                    <Pencil aria-hidden="true" />
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description=""
        actions={
          <Button className="rounded-lg" onClick={() => setAdding(true)}>
            <UserPlus aria-hidden="true" />
            Add user
          </Button>
        }
      />

      <Card className="gap-4">
        <CardContent>{body}</CardContent>
      </Card>

      <AddUserDialog open={adding} onOpenChange={setAdding} />
      {editing ? <EditUserDialog key={editing.id} user={editing} isSelf={me?.id === editing.id} onClose={() => setEditing(null)} /> : null}
    </div>
  )
}
