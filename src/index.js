/* eslint prefer-template: 0 */

import React from 'react'
import { fromEvent } from 'file-selector'
import PropTypes from 'prop-types'
import {
  isDragDataWithFiles,
  supportMultiple,
  fileAccepted,
  allFilesAccepted,
  fileMatchSize,
  onDocumentDragOver,
  isIeOrEdge,
  composeEventHandlers,
  isPropagationStopped,
  isDefaultPrevented
} from './utils'

const createInitialState = () => ({
  draggedFiles: [],
  acceptedFiles: [],
  rejectedFiles: [],
  isDragActive: false,
  isFocused: false
})

export function useDropzone(props) {
  const propsRef = React.useRef(props)
  propsRef.current = props

  const [state, setState] = React.useState(createInitialState)

  const nodeRef = React.useRef(null)
  const inputRef = React.useRef(null)
  const dragTargetsRef = React.useRef([])
  const isFileDialogActiveRef = React.useRef(false)

  const open = React.useCallback(
    () => {
      isFileDialogActiveRef.current = true
      if (inputRef.current != null) {
        inputRef.current.value = ''
        inputRef.current.click()
      }
    },
    [inputRef, isFileDialogActiveRef]
  )

  const inst = React.useMemo(
    () => {
      return {
        onDocumentDrop: evt => {
          if (nodeRef.current && nodeRef.current.contains(evt.target)) {
            // if we intercepted an event for our instance, let it propagate down to the instance's onDrop handler
            return
          }
          evt.preventDefault()
          dragTargetsRef.current = []
        },

        onDragStart: evt => {
          evt.persist()
          if (propsRef.current.onDragStart && isDragDataWithFiles(evt)) {
            propsRef.current.onDragStart(evt)
          }
        },

        onDragEnter: evt => {
          evt.preventDefault()

          // Count the dropzone and any children that are entered.
          if (dragTargetsRef.current.indexOf(evt.target) === -1) {
            dragTargetsRef.current.push(evt.target)
          }

          evt.persist()

          if (isDragDataWithFiles(evt)) {
            Promise.resolve((propsRef.current.getDataTransferItems || fromEvent)(evt)).then(
              draggedFiles => {
                if (isPropagationStopped(evt)) {
                  return
                }

                setState(state => ({
                  ...state,
                  draggedFiles,
                  // Do not rely on files for the drag state. It doesn't work in Safari.
                  isDragActive: true
                }))
              }
            )

            if (propsRef.current.onDragEnter) {
              propsRef.current.onDragEnter(evt)
            }
          }
        },

        onDragOver: evt => {
          evt.preventDefault()
          evt.persist()

          if (evt.dataTransfer) {
            evt.dataTransfer.dropEffect = 'copy'
          }

          if (propsRef.current.onDragOver && isDragDataWithFiles(evt)) {
            propsRef.current.onDragOver(evt)
          }

          return false
        },

        onDragLeave: evt => {
          evt.preventDefault()
          evt.persist()

          // Only deactivate once the dropzone and all children have been left.
          dragTargetsRef.current = dragTargetsRef.current.filter(
            el => el !== evt.target && nodeRef.current != null && nodeRef.current.contains(el)
          )
          if (dragTargetsRef.current.length > 0) {
            return
          }

          // Clear dragging files state
          setState(state => ({
            ...state,
            isDragActive: false,
            draggedFiles: []
          }))

          if (propsRef.current.onDragLeave && isDragDataWithFiles(evt)) {
            propsRef.current.onDragLeave(evt)
          }
        },

        onDrop: evt => {
          const {
            onDrop,
            onDropAccepted,
            onDropRejected,
            multiple = true,
            accept,
            getDataTransferItems = fromEvent
          } = propsRef.current

          // Stop default browser behavior
          evt.preventDefault()

          // Persist event for later usage
          evt.persist()

          // Reset the counter along with the drag on a drop.
          dragTargetsRef.current = []
          isFileDialogActiveRef.current = false

          // Reset drag state
          setState(state => ({
            ...state,
            isDragActive: false,
            draggedFiles: []
          }))

          if (isDragDataWithFiles(evt)) {
            Promise.resolve(getDataTransferItems(evt)).then(fileList => {
              const acceptedFiles = []
              const rejectedFiles = []

              if (isPropagationStopped(evt)) {
                return
              }

              fileList.forEach(file => {
                if (
                  fileAccepted(file, accept) &&
                  fileMatchSize(
                    file,
                    propsRef.current.maxSize == null ? Infinity : propsRef.current.maxSize,
                    propsRef.current.minSize == null ? 0 : propsRef.current.minSize
                  )
                ) {
                  acceptedFiles.push(file)
                } else {
                  rejectedFiles.push(file)
                }
              })

              if (!multiple && acceptedFiles.length > 1) {
                // if not in multi mode add any extra accepted files to rejected.
                // This will allow end users to easily ignore a multi file drop in "single" mode.
                rejectedFiles.push(...acceptedFiles.splice(0))
              }

              // Update `acceptedFiles` and `rejectedFiles` state
              // This will make children render functions receive the appropriate
              // values
              setState(state => ({ ...state, acceptedFiles, rejectedFiles }))
              if (onDrop) {
                onDrop(acceptedFiles, rejectedFiles, evt)
              }
              if (rejectedFiles.length > 0 && onDropRejected) {
                onDropRejected(rejectedFiles, evt)
              }
              if (acceptedFiles.length > 0 && onDropAccepted) {
                onDropAccepted(acceptedFiles, evt)
              }
            })
          }
        },

        onClick: evt => {
          const { onClick } = propsRef.current

          // if onClick prop is given, run it first
          if (onClick) {
            onClick(evt)
          }

          // If the event hasn't been default prevented from within
          // the onClick listener, open the file dialog
          if (!isDefaultPrevented(evt)) {
            evt.stopPropagation()

            // in IE11/Edge the file-browser dialog is blocking, ensure this is behind setTimeout
            // this is so react can handle state changes in the onClick prop above above
            // see: https://github.com/react-dropzone/react-dropzone/issues/450
            if (isIeOrEdge()) {
              setTimeout(open, 0)
            } else {
              open()
            }
          }
        },

        onInputElementClick: evt => {
          evt.stopPropagation()
        },

        onFileDialogCancel: () => {
          // timeout will not recognize context of this method
          const { onFileDialogCancel } = propsRef.current
          // execute the timeout only if the FileDialog is opened in the browser
          if (isFileDialogActiveRef.current) {
            setTimeout(() => {
              if (inputRef.current != null) {
                // Returns an object as FileList
                const { files } = inputRef.current

                if (!files.length) {
                  isFileDialogActiveRef.current = false

                  if (typeof onFileDialogCancel === 'function') {
                    onFileDialogCancel()
                  }
                }
              }
            }, 300)
          }
        },

        onFocus: evt => {
          const { onFocus } = propsRef.current
          if (onFocus) {
            onFocus(evt)
          }
          if (!isDefaultPrevented(evt)) {
            setState(state => ({ ...state, isFocused: true }))
          }
        },

        onBlur: evt => {
          const { onBlur } = propsRef.current
          if (onBlur) {
            onBlur(evt)
          }
          if (!isDefaultPrevented(evt)) {
            setState(state => ({ ...state, isFocused: false }))
          }
        },

        onKeyDown: evt => {
          const { onKeyDown } = propsRef.current
          if (nodeRef.current == null || !nodeRef.current.isEqualNode(evt.target)) {
            return
          }

          if (onKeyDown) {
            onKeyDown(evt)
          }

          if (!isDefaultPrevented(evt) && (evt.keyCode === 32 || evt.keyCode === 13)) {
            evt.preventDefault()
            open()
          }
        }
      }
    },
    [propsRef, setState, nodeRef, inputRef, dragTargetsRef, isFileDialogActiveRef, open]
  )

  React.useEffect(() => {
    const { preventDropOnDocument = true } = props
    if (preventDropOnDocument) {
      document.addEventListener('dragover', onDocumentDragOver, false)
      document.addEventListener('drop', inst.onDocumentDrop, false)
    }
    window.addEventListener('focus', inst.onFileDialogCancel, false)

    return () => {
      if (preventDropOnDocument) {
        document.removeEventListener('dragover', onDocumentDragOver)
        document.removeEventListener('drop', inst.onDocumentDrop)
      }
      window.removeEventListener('focus', inst.onFileDialogCancel, false)
    }
  }, [])

  const composeHandler = React.useCallback(
    handler => {
      if (propsRef.current.disabled) {
        return null
      }
      return handler
    },
    [propsRef]
  )

  const getRootProps = React.useCallback(
    ({
      refKey = 'ref',
      onKeyDown,
      onFocus,
      onBlur,
      onClick,
      onDragStart,
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDrop,
      ...rest
    }: any = {}) => ({
      onKeyDown: composeHandler(
        onKeyDown ? composeEventHandlers(onKeyDown, inst.onKeyDown) : inst.onKeyDown
      ),
      onFocus: composeHandler(onFocus ? composeEventHandlers(onFocus, inst.onFocus) : inst.onFocus),
      onBlur: composeHandler(onBlur ? composeEventHandlers(onBlur, inst.onBlur) : inst.onBlur),
      onClick: composeHandler(onClick ? composeEventHandlers(onClick, inst.onClick) : inst.onClick),
      onDragStart: composeHandler(
        onDragStart ? composeEventHandlers(onDragStart, inst.onDragStart) : inst.onDragStart
      ),
      onDragEnter: composeHandler(
        onDragEnter ? composeEventHandlers(onDragEnter, inst.onDragEnter) : inst.onDragEnter
      ),
      onDragOver: composeHandler(
        onDragOver ? composeEventHandlers(onDragOver, inst.onDragOver) : inst.onDragOver
      ),
      onDragLeave: composeHandler(
        onDragLeave ? composeEventHandlers(onDragLeave, inst.onDragLeave) : inst.onDragLeave
      ),
      onDrop: composeHandler(onDrop ? composeEventHandlers(onDrop, inst.onDrop) : inst.onDrop),
      [refKey]: nodeRef,
      tabIndex: propsRef.current.disabled ? -1 : 0,
      ...rest
    }),
    [propsRef, inst, composeHandler]
  )

  const getInputProps = React.useCallback(
    ({ refKey = 'ref', onChange, onClick, ...rest }: any = {}) => {
      const { accept, multiple = true, name } = propsRef.current
      const inputProps = {
        accept,
        type: 'file',
        style: { display: 'none' },
        multiple: supportMultiple && multiple,
        onChange: composeEventHandlers(onChange, inst.onDrop),
        onClick: composeEventHandlers(onClick, inst.onInputElementClick),
        autoComplete: 'off',
        tabIndex: -1,
        [refKey]: inputRef
      }
      if (name && name.length) {
        inputProps.name = name
      }
      return {
        ...inputProps,
        ...rest
      }
    },
    [propsRef, inst]
  )

  const { accept, multiple = true, disabled } = props
  const { isDragActive, isFocused, draggedFiles, acceptedFiles, rejectedFiles } = state
  const filesCount = draggedFiles.length
  const isMultipleAllowed = multiple || filesCount <= 1
  const isDragAccept = filesCount > 0 && allFilesAccepted(draggedFiles, accept)
  const isDragReject = filesCount > 0 && (!isDragAccept || !isMultipleAllowed)
  return {
    isDragActive,
    isDragAccept,
    isDragReject,
    draggedFiles,
    acceptedFiles,
    rejectedFiles,
    isFocused: isFocused && !disabled,
    getRootProps,
    getInputProps,
    open
  }
}

const Dropzone = React.forwardRef(function Dropzone({ children, ...props }, ref) {
  const dropzone = useDropzone(props)
  React.useImperativeHandle(ref, () => ({ open: dropzone.open }), [dropzone.open])
  return children(dropzone)
})

export default Dropzone

Dropzone.propTypes = {
  /**
   * Allow specific types of files. See https://github.com/okonet/attr-accept for more information.
   * Keep in mind that mime type determination is not reliable across platforms. CSV files,
   * for example, are reported as text/plain under macOS but as application/vnd.ms-excel under
   * Windows. In some cases there might not be a mime type set at all.
   * See: https://github.com/react-dropzone/react-dropzone/issues/276
   */
  accept: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]),

  /**
   * Render function that renders the actual component
   *
   * @param {Object} props
   * @param {Function} props.getRootProps Returns the props you should apply to the root drop container you render
   * @param {Function} props.getInputProps Returns the props you should apply to hidden file input you render
   * @param {Function} props.open Open the native file selection dialog
   * @param {Boolean} props.isFocused Dropzone area is in focus
   * @param {Boolean} props.isDragActive Active drag is in progress
   * @param {Boolean} props.isDragAccept Dragged files are accepted
   * @param {Boolean} props.isDragReject Some dragged files are rejected
   * @param {Array} props.draggedFiles Files in active drag
   * @param {Array} props.acceptedFiles Accepted files
   * @param {Array} props.rejectedFiles Rejected files
   */
  children: PropTypes.func,

  /**
   * Enable/disable the dropzone entirely
   */
  disabled: PropTypes.bool,

  /**
   * If false, allow dropped items to take over the current browser window
   */
  preventDropOnDocument: PropTypes.bool,

  /**
   * Allow dropping multiple files
   */
  multiple: PropTypes.bool,

  /**
   * `name` attribute for the input tag
   */
  name: PropTypes.string,

  /**
   * Maximum file size (in bytes)
   */
  maxSize: PropTypes.number,

  /**
   * Minimum file size (in bytes)
   */
  minSize: PropTypes.number,

  /**
   * getDataTransferItems handler
   * @param {Event} event
   * @returns {Array} array of File objects
   */
  getDataTransferItems: PropTypes.func,

  /**
   * onClick callback
   * @param {Event} event
   */
  onClick: PropTypes.func,

  /**
   * onFocus callback
   */
  onFocus: PropTypes.func,

  /**
   * onBlur callback
   */
  onBlur: PropTypes.func,

  /**
   * onKeyDown callback
   */
  onKeyDown: PropTypes.func,

  /**
   * The `onDrop` method that accepts two arguments.
   * The first argument represents the accepted files and the second argument the rejected files.
   *
   * ```javascript
   * function onDrop(acceptedFiles, rejectedFiles) {
   *   // do stuff with files...
   * }
   * ```
   *
   * Files are accepted or rejected based on the `accept` prop.
   * This must be a valid [MIME type](http://www.iana.org/assignments/media-types/media-types.xhtml) according to [input element specification](https://www.w3.org/wiki/HTML/Elements/input/file) or a valid file extension.
   *
   * Note that the `onDrop` callback will always be called regardless if the dropped files were accepted or rejected.
   * You can use the `onDropAccepted`/`onDropRejected` props if you'd like to react to a specific event instead of the `onDrop` prop.
   *
   * The `onDrop` callback will provide you with an array of [Files](https://developer.mozilla.org/en-US/docs/Web/API/File) which you can then process and send to a server.
   * For example, with [SuperAgent](https://github.com/visionmedia/superagent) as a http/ajax library:
   *
   * ```javascript
   * function onDrop(acceptedFiles) {
   *   const req = request.post('/upload')
   *   acceptedFiles.forEach(file => {
   *     req.attach(file.name, file)
   *   })
   *   req.end(callback)
   * }
   * ```
   */
  onDrop: PropTypes.func,

  /**
   * onDropAccepted callback
   */
  onDropAccepted: PropTypes.func,

  /**
   * onDropRejected callback
   */
  onDropRejected: PropTypes.func,

  /**
   * onDragStart callback
   */
  onDragStart: PropTypes.func,

  /**
   * onDragEnter callback
   */
  onDragEnter: PropTypes.func,

  /**
   * onDragOver callback
   */
  onDragOver: PropTypes.func,

  /**
   * onDragLeave callback
   */
  onDragLeave: PropTypes.func,

  /**
   * Provide a callback on clicking the cancel button of the file dialog
   */
  onFileDialogCancel: PropTypes.func
}
