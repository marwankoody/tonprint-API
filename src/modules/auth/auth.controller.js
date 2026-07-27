import { asyncHandler } from '../../middleware/errorHandler.js'
import { getRefreshCookieOptions, REFRESH_COOKIE_NAME } from '../../config/cookies.js'
import { env } from '../../config/env.js'
import { parseDurationToMs } from '../../utils/parseDuration.js'
import * as authService from './auth.service.js'

/**
 * Pose le cookie httpOnly contenant le refresh token.
 * @param {import('express').Response} res
 * @param {string} refreshToken
 */
function setRefreshCookie(res, refreshToken) {
  const maxAgeMs = parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN)
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions({ maxAgeMs }))
}

export const register = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.register(req.body)
  setRefreshCookie(res, refreshToken)
  res.status(201).json({ success: true, data: { user, accessToken } })
})

export const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body)
  setRefreshCookie(res, refreshToken)
  res.status(200).json({ success: true, data: { user, accessToken } })
})

export const refreshTokens = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME]
  const { user, accessToken, refreshToken } = await authService.refresh(incomingRefreshToken)
  setRefreshCookie(res, refreshToken)
  res.status(200).json({ success: true, data: { user, accessToken } })
})

export const logout = asyncHandler(async (req, res) => {
  if (req.user?.id) {
    await authService.logout(req.user.id)
  }
  res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions())
  res.status(200).json({ success: true, message: 'Logged out successfully' })
})

export const getMe = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user.id)
  res.status(200).json({ success: true, data: { user } })
})

export const updateProfile = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.user.id, req.body)
  res.status(200).json({ success: true, data: { user } })
})

export const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.id, req.body)
  res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions())
  res.status(200).json({
    success: true,
    message: 'Password updated successfully. Please log in again.',
  })
})

export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.requestPasswordReset(req.body.email)
  res.status(200).json({
    success: true,
    message:
      'If an account exists for this email, a reset code has been sent.',
  })
})

export const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body)
  res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions())
  res.status(200).json({
    success: true,
    message: 'Password reset successfully. Please log in.',
  })
})
